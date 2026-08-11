'use client';

import { useCallback, useRef, useState } from 'react';
import type { TaskKind } from './engine/model-routing';

/**
 * Client hook for the streaming /api/ai endpoint.
 *
 * Reads the SSE frames emitted by toSseResponse() and exposes the text as it
 * arrives, so every AI surface in the app gets live output with one call.
 */

export interface AiStreamRequest {
  task: TaskKind;
  dealId?: string;
  content?: string;
  audiencePersona?: string;
  /**
   * Which posture a competitive card argues against — a catalog key ('grid')
   * or a stored competitor row id. Passed, never inferred: a card that guessed
   * would be wrong on any deal facing more than one competitor, and nothing on
   * the page would say so.
   */
  postureKey?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface AiStreamState {
  text: string;
  streaming: boolean;
  error: string | null;
  /** Which provider served it — surfaced so cost/quality is never a mystery. */
  provider: string | null;
  model: string | null;
}

const INITIAL: AiStreamState = {
  text: '',
  streaming: false,
  error: null,
  provider: null,
  model: null,
};

interface Frame {
  type: 'text' | 'meta' | 'error';
  text?: string;
  provider?: string;
  model?: string;
  message?: string;
}

export function useAiStream() {
  const [state, setState] = useState<AiStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, streaming: false }));
  }, []);

  const run = useCallback(async (req: AiStreamRequest): Promise<string> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ ...INITIAL, streaming: true });
    let accumulated = '';

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      // Gate failures come back as JSON, not a stream.
      if (!res.ok) {
        const contentType = res.headers.get('content-type') ?? '';
        const message = contentType.includes('json')
          ? ((await res.json()) as { error?: string }).error
          : await res.text();
        setState({
          ...INITIAL,
          error: message || `Request failed (${res.status})`,
        });
        return '';
      }

      if (!res.body) {
        setState({ ...INITIAL, error: 'No response body.' });
        return '';
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the trailing partial line for the next chunk.
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          let frame: Frame;
          try {
            frame = JSON.parse(payload) as Frame;
          } catch {
            continue;
          }

          if (frame.type === 'text' && frame.text) {
            accumulated += frame.text;
            const snapshot = accumulated;
            setState((s) => ({ ...s, text: snapshot }));
          } else if (frame.type === 'meta') {
            setState((s) => ({
              ...s,
              provider: frame.provider ?? s.provider,
              model: frame.model ?? s.model,
            }));
          } else if (frame.type === 'error') {
            setState((s) => ({ ...s, error: frame.message ?? 'Model call failed.' }));
          }
        }
      }

      setState((s) => ({ ...s, streaming: false }));
      return accumulated;
    } catch (err) {
      // An abort is a user action, not an error to surface.
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState((s) => ({ ...s, streaming: false }));
        return accumulated;
      }
      setState({
        ...INITIAL,
        text: accumulated,
        error: err instanceof Error ? err.message : 'Request failed.',
      });
      return accumulated;
    } finally {
      abortRef.current = null;
    }
  }, []);

  return { ...state, run, stop, reset };
}
