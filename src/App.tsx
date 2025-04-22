
import { VoiceRecorder } from './components/VoiceRecorder'

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white p-4 flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold text-indigo-800 mb-8">Voice Recorder with Instant Transcription</h1>
      <VoiceRecorder />
      <footer className="mt-8 text-center text-gray-500 text-sm">
        Powered by OpenAI Whisper API
      </footer>
    </div>
  )
}

export default App