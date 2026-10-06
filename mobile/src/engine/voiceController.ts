/**
 * CHIWIWI Full-Duplex Live Voice Controller
 * Coordinates VAD silence trigger, sentence-level streaming chunker, and audio output.
 */

import { VoiceStreamer, type SentenceChunk } from '../services/voiceStreamer.ts';
import { MobileOrchestrator } from './orchestrator.ts';
import { LocalLlmDriver } from './localLlm.ts';
import type { SoulArchetypeKey, PADVector } from '../types/soul.ts';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceEventHandlers {
  onStateChange: (state: VoiceState) => void;
  onTranscriptUpdate: (text: string) => void;
  onSentenceReady: (chunk: SentenceChunk) => void;
}

export class VoiceController {
  private streamer = new VoiceStreamer();
  private state: VoiceState = 'idle';
  private handlers: VoiceEventHandlers;

  constructor(handlers: VoiceEventHandlers) {
    this.handlers = handlers;
  }

  public getState(): VoiceState {
    return this.state;
  }

  public startListening(): void {
    this.state = 'listening';
    this.handlers.onStateChange('listening');
    this.streamer.reset();
  }

  /**
   * Called when user speech ends (triggered by VAD silence).
   */
  public async handleUserSpeechEnd(
    recognizedSpeech: string,
    archetype: SoulArchetypeKey,
    pad: PADVector,
    modelFilename: string
  ): Promise<void> {
    if (!recognizedSpeech.trim()) {
      this.state = 'idle';
      this.handlers.onStateChange('idle');
      return;
    }

    this.state = 'thinking';
    this.handlers.onStateChange('thinking');
    this.handlers.onTranscriptUpdate(recognizedSpeech);

    // 1. Route and synthesize system prompt through mobile orchestrator
    const turnResult = MobileOrchestrator.processTurn(recognizedSpeech, archetype, pad);

    // 2. Stream tokens from on-device LLM
    this.state = 'speaking';
    this.handlers.onStateChange('speaking');
    this.streamer.reset();

    const stream = LocalLlmDriver.generateStream({
      modelFilename,
      systemPrompt: turnResult.synthesizedPrompt,
      userPrompt: recognizedSpeech,
    });

    for await (const token of stream) {
      const chunk = this.streamer.ingestToken(token);
      if (chunk) {
        // Immediately dispatch sentence to neural TTS
        this.handlers.onSentenceReady(chunk);
      }
    }

    // Flush remaining buffer
    const finalChunk = this.streamer.flush();
    if (finalChunk) {
      this.handlers.onSentenceReady(finalChunk);
    }

    this.state = 'idle';
    this.handlers.onStateChange('idle');
  }

  public stop(): void {
    this.state = 'idle';
    this.handlers.onStateChange('idle');
    this.streamer.reset();
  }
}
