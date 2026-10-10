package com.chiwiwi.sovereign.diffusion

import android.app.Service
import android.content.Intent
import android.os.*
import android.util.Log
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class DiffusionWorkerService : Service() {
    companion object {
        private const val TAG = "DiffusionWorkerService"

        const val MSG_INIT = 1
        const val MSG_GENERATE = 2
        const val MSG_CANCEL = 3
        const val MSG_RELEASE = 4

        const val MSG_PROGRESS = 10
        const val MSG_COMPLETE = 11
        const val MSG_ERROR = 12

        const val KEY_MODEL_PATH = "modelPath"
        const val KEY_THREADS = "threads"
        const val KEY_PROMPT = "prompt"
        const val KEY_NEGATIVE_PROMPT = "negativePrompt"
        const val KEY_WIDTH = "width"
        const val KEY_HEIGHT = "height"
        const val KEY_STEPS = "steps"
        const val KEY_CFG_SCALE = "cfgScale"
        const val KEY_SEED = "seed"
        const val KEY_OUTPUT_PATH = "outputPath"

        const val KEY_STEP = "step"
        const val KEY_TOTAL_STEPS = "totalSteps"
        const val KEY_TIME_SEC = "timeSec"
        const val KEY_ERROR_MSG = "errorMsg"
    }

    private var currentModelPath: String? = null
    private var ctxHandle: Long = 0L
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()

    inner class IncomingHandler : Handler(Looper.getMainLooper()) {
        override fun handleMessage(msg: Message) {
            when (msg.what) {
                MSG_INIT -> handleInit(msg)
                MSG_GENERATE -> handleGenerate(msg)
                MSG_CANCEL -> handleCancel()
                MSG_RELEASE -> handleRelease()
                else -> super.handleMessage(msg)
            }
        }
    }

    private val messenger = Messenger(IncomingHandler())

    override fun onBind(intent: Intent?): IBinder {
        Log.i(TAG, "DiffusionWorkerService onBind in process: ${Process.myPid()}")
        return messenger.binder
    }

    private fun handleInit(msg: Message) {
        val data = msg.data ?: return
        val modelPath = data.getString(KEY_MODEL_PATH) ?: return
        val threads = data.getInt(KEY_THREADS, 4)

        if (ctxHandle != 0L && currentModelPath == modelPath) {
            Log.i(TAG, "Model already initialized: $modelPath")
            return
        }

        executor.execute {
            if (!NativeDiffusion.ensureLoaded()) {
                Log.e(TAG, "Native diffusion library could not be loaded: ${NativeDiffusion.getLoadError()?.message}")
                return@execute
            }
            if (ctxHandle != 0L) {
                NativeDiffusion.nativeRelease(ctxHandle)
                ctxHandle = 0L
            }
            Log.i(TAG, "Initializing model: $modelPath with $threads threads")
            ctxHandle = NativeDiffusion.nativeInit(modelPath, threads)
            currentModelPath = modelPath
            Log.i(TAG, "Model initialized handle: $ctxHandle")
        }
    }

    private fun handleGenerate(msg: Message) {
        val replyTo = msg.replyTo
        val data = msg.data ?: return

        val prompt = data.getString(KEY_PROMPT) ?: ""
        val negativePrompt = data.getString(KEY_NEGATIVE_PROMPT)
        val width = data.getInt(KEY_WIDTH, 512)
        val height = data.getInt(KEY_HEIGHT, 512)
        val steps = data.getInt(KEY_STEPS, 4)
        val cfgScale = data.getFloat(KEY_CFG_SCALE, 1.5f)
        val seed = data.getLong(KEY_SEED, -1L)
        val outputPath = data.getString(KEY_OUTPUT_PATH) ?: ""
        val modelPath = data.getString(KEY_MODEL_PATH)
        val threads = data.getInt(KEY_THREADS, 4)

        executor.execute {
            try {
                if (!NativeDiffusion.ensureLoaded()) {
                    val err = NativeDiffusion.getLoadError()?.message ?: "Native library not loaded"
                    sendError(replyTo, "Failed to load native diffusion library: $err")
                    return@execute
                }

                // Initialize context if not ready or model changed
                if (ctxHandle == 0L || (modelPath != null && modelPath != currentModelPath)) {
                    if (ctxHandle != 0L) {
                        NativeDiffusion.nativeRelease(ctxHandle)
                        ctxHandle = 0L
                    }
                    val targetModel = modelPath ?: currentModelPath
                    if (targetModel == null) {
                        sendError(replyTo, "No diffusion model specified or loaded")
                        return@execute
                    }
                    Log.i(TAG, "Loading model on-demand: $targetModel")
                    ctxHandle = NativeDiffusion.nativeInit(targetModel, threads)
                    currentModelPath = targetModel
                }

                if (ctxHandle == 0L) {
                    val err = try { NativeDiffusion.nativeGetLastError() } catch (t: Throwable) { "" }
                    val detail = if (!err.isNullOrBlank()) ": $err" else ""
                    sendError(replyTo, "Failed to initialize native diffusion engine$detail")
                    return@execute
                }

                val progressCallback = object : ProgressCallback {
                    override fun onStepProgress(step: Int, totalSteps: Int, timeSec: Float) {
                        if (replyTo != null) {
                            val pMsg = Message.obtain(null, MSG_PROGRESS)
                            val pData = Bundle()
                            pData.putInt(KEY_STEP, step)
                            pData.putInt(KEY_TOTAL_STEPS, totalSteps)
                            pData.putFloat(KEY_TIME_SEC, timeSec)
                            pMsg.data = pData
                            try {
                                replyTo.send(pMsg)
                            } catch (e: RemoteException) {
                                Log.w(TAG, "Failed to send progress event", e)
                            }
                        }
                    }
                }

                Log.i(TAG, "Executing native generation...")
                val success = NativeDiffusion.nativeGenerate(
                    ctxHandle = ctxHandle,
                    prompt = prompt,
                    negativePrompt = negativePrompt,
                    width = width,
                    height = height,
                    steps = steps,
                    cfgScale = cfgScale,
                    seed = seed,
                    outputPath = outputPath,
                    progressCallback = progressCallback
                )

                if (success) {
                    Log.i(TAG, "Generation succeeded, output: $outputPath")
                    if (replyTo != null) {
                        val cMsg = Message.obtain(null, MSG_COMPLETE)
                        val cData = Bundle()
                        cData.putString(KEY_OUTPUT_PATH, outputPath)
                        cData.putLong(KEY_SEED, seed)
                        cMsg.data = cData
                        replyTo.send(cMsg)
                    }
                } else {
                    val err = try { NativeDiffusion.nativeGetLastError() } catch (t: Throwable) { "" }
                    val detail = if (!err.isNullOrBlank()) ": $err" else ""
                    sendError(replyTo, "Native diffusion generation failed or was cancelled$detail")
                }
            } catch (t: Throwable) {
                Log.e(TAG, "Exception during generation", t)
                sendError(replyTo, "Error during generation: ${t.message}")
            }
        }
    }

    private fun handleCancel() {
        if (ctxHandle != 0L) {
            Log.i(TAG, "Canceling native generation")
            NativeDiffusion.nativeCancel(ctxHandle)
        }
    }

    private fun handleRelease() {
        if (ctxHandle != 0L) {
            Log.i(TAG, "Releasing native context")
            NativeDiffusion.nativeRelease(ctxHandle)
            ctxHandle = 0L
            currentModelPath = null
        }
    }

    private fun sendError(replyTo: Messenger?, errorMsg: String) {
        if (replyTo == null) return
        val eMsg = Message.obtain(null, MSG_ERROR)
        val eData = Bundle()
        eData.putString(KEY_ERROR_MSG, errorMsg)
        eMsg.data = eData
        try {
            replyTo.send(eMsg)
        } catch (e: RemoteException) {
            Log.w(TAG, "Failed to send error event", e)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handleRelease()
        executor.shutdown()
        Log.i(TAG, "DiffusionWorkerService destroyed")
    }
}
