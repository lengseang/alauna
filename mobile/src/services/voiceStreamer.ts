/**
 * CHIWIWI Punctuation-Level Streaming Chunker
 * Intercepts LLM token stream and dispatches complete sentences to offline TTS
 * immediately, achieving ~400ms perceived voice response latency.
 */

export interface SentenceChunk {
  index: number;
  text: string;
  isFinal: boolean;
}

export class VoiceStreamer {
  private buffer: string = '';
  private chunkIndex: number = 0;
  private readonly punctuationRegex = /([.?!;:\n]+(?:\s+|$))/;

  /**
   * Reset state for a new turn.
   */
  public reset(): void {
    this.buffer = '';
    this.chunkIndex = 0;
  }

  /**
   * Ingest a token from the LLM stream.
   * Returns a SentenceChunk if a punctuation boundary was crossed, otherwise null.
   */
  public ingestToken(token: string): SentenceChunk | null {
    this.buffer += token;

    const match = this.buffer.match(this.punctuationRegex);
    if (match && match.index !== undefined) {
      const splitPoint = match.index + match[0].length;
      const sentence = this.buffer.slice(0, splitPoint).trim();
      this.buffer = this.buffer.slice(splitPoint);

      if (sentence.length > 0) {
        const chunk: SentenceChunk = {
          index: this.chunkIndex++,
          text: sentence,
          isFinal: false,
        };
        return chunk;
      }
    }

    return null;
  }

  /**
   * Flush any remaining tokens when generation finishes.
   */
  public flush(): SentenceChunk | null {
    const remaining = this.buffer.trim();
    this.buffer = '';

    if (remaining.length > 0) {
      return {
        index: this.chunkIndex++,
        text: remaining,
        isFinal: true,
      };
    }

    return null;
  }
}
