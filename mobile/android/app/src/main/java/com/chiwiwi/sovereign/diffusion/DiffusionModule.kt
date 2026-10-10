package com.chiwiwi.sovereign.diffusion

import android.content.ComponentName
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.*
import android.provider.MediaStore
import android.util.Log
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

@ReactModule(name = DiffusionModule.NAME)
class DiffusionModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "DiffusionModule"
        const val NAME = "DiffusionModule"
        const val EVENT_PROGRESS = "onDiffusionProgress"
    }

    override fun getName(): String = NAME

    private var workerMessenger: Messenger? = null
    private var isBound = false
    private var activePromise: Promise? = null

    inner class ResponseHandler : Handler(Looper.getMainLooper()) {
        override fun handleMessage(msg: Message) {
            when (msg.what) {
                DiffusionWorkerService.MSG_PROGRESS -> {
                    val data = msg.data ?: return
                    val step = data.getInt(DiffusionWorkerService.KEY_STEP)
                    val totalSteps = data.getInt(DiffusionWorkerService.KEY_TOTAL_STEPS)
                    val timeSec = data.getFloat(DiffusionWorkerService.KEY_TIME_SEC)
                    val stage = data.getString(DiffusionWorkerService.KEY_STAGE) ?: if (totalSteps > 100) "loading_weights" else "denoising"

                    val params = Arguments.createMap().apply {
                        putInt("step", step)
                        putInt("totalSteps", totalSteps)
                        putDouble("timeSec", timeSec.toDouble())
                        putString("stage", stage)
                    }
                    sendEvent(EVENT_PROGRESS, params)
                }
                DiffusionWorkerService.MSG_COMPLETE -> {
                    val data = msg.data ?: return
                    val outputPath = data.getString(DiffusionWorkerService.KEY_OUTPUT_PATH)
                    val seed = data.getLong(DiffusionWorkerService.KEY_SEED)

                    val result = Arguments.createMap().apply {
                        putBoolean("success", true)
                        putString("outputPath", outputPath)
                        putDouble("seed", seed.toDouble())
                    }
                    activePromise?.resolve(result)
                    activePromise = null
                }
                DiffusionWorkerService.MSG_ERROR -> {
                    val data = msg.data ?: return
                    val errorMsg = data.getString(DiffusionWorkerService.KEY_ERROR_MSG) ?: "Unknown generation error"
                    activePromise?.reject("ERR_GENERATION_FAILED", errorMsg)
                    activePromise = null
                }
                else -> super.handleMessage(msg)
            }
        }
    }

    private val replyMessenger = Messenger(ResponseHandler())

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            Log.i(TAG, "DiffusionWorkerService connected")
            workerMessenger = Messenger(service)
            isBound = true
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.w(TAG, "DiffusionWorkerService disconnected (worker process terminated or crashed)")
            workerMessenger = null
            isBound = false

            // Critical OOM protection: notify JS immediately without killing Chiwiwi
            activePromise?.reject(
                "ERR_WORKER_DIED",
                "The isolated diffusion worker was terminated by Android OS (device RAM threshold reached). Chat history and application are preserved."
            )
            activePromise = null
        }
    }

    private fun ensureBound(): Boolean {
        if (isBound && workerMessenger != null) return true
        val intent = Intent(reactContext, DiffusionWorkerService::class.java)
        val success = reactContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
        isBound = success
        return success
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(eventName, params)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to emit event $eventName", e)
        }
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        val bound = ensureBound()
        val result = Arguments.createMap().apply {
            putBoolean("isLibraryLoaded", true)
            putBoolean("isWorkerBound", bound)
            putString("architecture", "IsolatedProcess")
        }
        promise.resolve(result)
    }

    @ReactMethod
    fun generateImage(options: ReadableMap, promise: Promise) {
        if (activePromise != null) {
            promise.reject("ERR_BUSY", "Another image generation is currently in progress")
            return
        }

        if (!ensureBound()) {
            promise.reject("ERR_SERVICE_UNAVAILABLE", "Failed to bind to isolated diffusion worker service")
            return
        }

        activePromise = promise

        val prompt = options.getString("prompt") ?: ""
        val negativePrompt = if (options.hasKey("negativePrompt")) options.getString("negativePrompt") else null
        val modelPath = options.getString("modelPath") ?: ""
        val outputPath = options.getString("outputPath") ?: ""
        val width = if (options.hasKey("width")) options.getInt("width") else 512
        val height = if (options.hasKey("height")) options.getInt("height") else 512
        val steps = if (options.hasKey("steps")) options.getInt("steps") else 4
        val cfgScale = if (options.hasKey("cfgScale")) options.getDouble("cfgScale").toFloat() else 1.5f
        val seed = if (options.hasKey("seed")) options.getDouble("seed").toLong() else -1L
        val threads = if (options.hasKey("threads")) options.getInt("threads") else 4
        val sampleMethod = if (options.hasKey("sampleMethod")) options.getString("sampleMethod") else "auto"

        val msg = Message.obtain(null, DiffusionWorkerService.MSG_GENERATE)
        msg.replyTo = replyMessenger

        val bundle = Bundle().apply {
            putString(DiffusionWorkerService.KEY_PROMPT, prompt)
            putString(DiffusionWorkerService.KEY_NEGATIVE_PROMPT, negativePrompt)
            putString(DiffusionWorkerService.KEY_MODEL_PATH, modelPath)
            putString(DiffusionWorkerService.KEY_OUTPUT_PATH, outputPath)
            putInt(DiffusionWorkerService.KEY_WIDTH, width)
            putInt(DiffusionWorkerService.KEY_HEIGHT, height)
            putInt(DiffusionWorkerService.KEY_STEPS, steps)
            putFloat(DiffusionWorkerService.KEY_CFG_SCALE, cfgScale)
            putLong(DiffusionWorkerService.KEY_SEED, seed)
            putInt(DiffusionWorkerService.KEY_THREADS, threads)
            putString(DiffusionWorkerService.KEY_SAMPLE_METHOD, sampleMethod)
        }
        msg.data = bundle

        try {
            workerMessenger?.send(msg) ?: run {
                activePromise = null
                promise.reject("ERR_NOT_CONNECTED", "Worker messenger not ready")
            }
        } catch (e: RemoteException) {
            activePromise = null
            promise.reject("ERR_IPC_FAILED", "Failed to communicate with diffusion worker: ${e.message}")
        }
    }

    @ReactMethod
    fun cancelGeneration(promise: Promise) {
        if (workerMessenger != null) {
            val msg = Message.obtain(null, DiffusionWorkerService.MSG_CANCEL)
            try {
                workerMessenger?.send(msg)
                promise.resolve(true)
            } catch (e: RemoteException) {
                promise.reject("ERR_CANCEL_FAILED", e.message)
            }
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun shareImage(filePath: String, promise: Promise) {
        try {
            val cleanPath = if (filePath.startsWith("file://")) filePath.substring(7) else filePath
            val file = File(cleanPath)
            if (!file.exists()) {
                promise.reject("ERR_FILE_NOT_FOUND", "File does not exist: $filePath")
                return
            }

            val authority = "${reactContext.packageName}.fileprovider"
            val contentUri: Uri = FileProvider.getUriForFile(reactContext, authority, file)

            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, contentUri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            val chooser = Intent.createChooser(shareIntent, "Share Image").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(chooser)
            promise.resolve(true)
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to share image", t)
            promise.reject("ERR_SHARE_FAILED", t.message)
        }
    }

    @ReactMethod
    fun saveToGallery(filePath: String, promise: Promise) {
        try {
            val cleanPath = if (filePath.startsWith("file://")) filePath.substring(7) else filePath
            val file = File(cleanPath)
            if (!file.exists()) {
                promise.reject("ERR_FILE_NOT_FOUND", "File does not exist: $filePath")
                return
            }

            val resolver = reactContext.contentResolver
            val fileName = file.name
            val mimeType = if (fileName.endsWith(".jpg", true) || fileName.endsWith(".jpeg", true)) "image/jpeg" else "image/png"

            val contentValues = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Images.Media.MIME_TYPE, mimeType)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Chiwiwi")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
            }

            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
            if (uri != null) {
                resolver.openOutputStream(uri)?.use { out ->
                    FileInputStream(file).use { inStream ->
                        inStream.copyTo(out)
                    }
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    contentValues.clear()
                    contentValues.put(MediaStore.Images.Media.IS_PENDING, 0)
                    resolver.update(uri, contentValues, null, null)
                }

                MediaScannerConnection.scanFile(
                    reactContext,
                    arrayOf(file.absolutePath),
                    arrayOf(mimeType),
                    null
                )

                promise.resolve(uri.toString())
            } else {
                val picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
                val chiwiwiDir = File(picturesDir, "Chiwiwi")
                if (!chiwiwiDir.exists()) chiwiwiDir.mkdirs()
                val destFile = File(chiwiwiDir, fileName)
                FileInputStream(file).use { input ->
                    FileOutputStream(destFile).use { output ->
                        input.copyTo(output)
                    }
                }
                MediaScannerConnection.scanFile(
                    reactContext,
                    arrayOf(destFile.absolutePath),
                    arrayOf(mimeType),
                    null
                )
                promise.resolve(destFile.absolutePath)
            }
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to save image to gallery", t)
            promise.reject("ERR_SAVE_FAILED", t.message)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep React Native event emitter happy
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep React Native event emitter happy
    }

    override fun invalidate() {
        super.invalidate()
        if (isBound) {
            try {
                reactContext.unbindService(serviceConnection)
            } catch (e: Exception) {
                Log.w(TAG, "Error unbinding service", e)
            }
            isBound = false
        }
    }
}
