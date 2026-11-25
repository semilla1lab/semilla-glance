// Speech-to-text for the glasses microphone.
// The SDK delivers 16 kHz signed 16-bit little-endian mono PCM. We wrap it as WAV
// and send it to any OpenAI-compatible /audio/transcriptions endpoint (Whisper,
// Groq, local faster-whisper server). No key? Demo mode returns DEMO_TRANSCRIPT.
export function pcmToWav(pcm, sampleRate = 16000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function rms(pcm) {
  if (pcm.length < 2) return 0;
  let sum = 0;
  const n = Math.floor(pcm.length / 2);
  for (let i = 0; i < n; i++) {
    const v = pcm.readInt16LE(i * 2);
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

export class Transcriber {
  constructor({ baseUrl, apiKey, model = 'whisper-1', demoTranscript = '' } = {}) {
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
    this.apiKey = apiKey || '';
    this.model = model;
    this.demoTranscript = demoTranscript;
  }

  async transcribe(pcm) {
    const silent = pcm.length < 3200 || rms(pcm) < 50;
    if (this.baseUrl && !silent) {
      const form = new FormData();
      form.append('file', new Blob([pcmToWav(pcm)], { type: 'audio/wav' }), 'note.wav');
      form.append('model', this.model);
      const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error(`stt ${res.status}`);
      const data = await res.json();
      return { text: data.text || '', source: 'whisper' };
    }
    if (this.demoTranscript) return { text: this.demoTranscript, source: 'demo' };
    return { text: '', source: silent ? 'silence' : 'no-stt' };
  }
}
