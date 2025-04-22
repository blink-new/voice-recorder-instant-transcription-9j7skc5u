
import { useState, useRef, useEffect } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
    }
  }, [])

  const startRecording = async () => {
    try {
      setError(null)
      audioChunksRef.current = []
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      
      mediaRecorderRef.current = mediaRecorder
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setAudioBlob(audioBlob)
        await transcribeAudio(audioBlob)
        
        // Stop all tracks from the stream
        stream.getTracks().forEach(track => track.stop())
      }
      
      // Start recording
      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      
      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
    } catch (err) {
      console.error('Error starting recording:', err)
      setError('Could not access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      // Clear timer
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  const transcribeAudio = async (blob: Blob) => {
    try {
      setIsTranscribing(true)
      
      // Convert blob to base64
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      
      reader.onloadend = async () => {
        const base64Audio = reader.result as string
        
        // Call Supabase Edge Function
        const { data, error } = await supabase.functions.invoke('transcribe', {
          body: { audio: base64Audio }
        })
        
        if (error) {
          console.error('Error transcribing audio:', error)
          setError('Failed to transcribe audio. Please try again.')
          setIsTranscribing(false)
          return
        }
        
        setTranscription(data.transcription.text)
        setIsTranscribing(false)
      }
    } catch (err) {
      console.error('Error transcribing audio:', err)
      setError('Failed to transcribe audio. Please try again.')
      setIsTranscribing(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Voice Recorder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          <div 
            className={cn(
              "w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300",
              isRecording 
                ? "bg-red-100 animate-pulse" 
                : "bg-gray-100"
            )}
          >
            {isRecording ? (
              <Square 
                className="h-12 w-12 text-red-500 cursor-pointer" 
                onClick={stopRecording}
              />
            ) : (
              <Mic 
                className="h-12 w-12 text-gray-500 cursor-pointer" 
                onClick={startRecording}
              />
            )}
          </div>
        </div>
        
        {isRecording && (
          <div className="text-center font-mono text-xl">
            {formatTime(recordingTime)}
          </div>
        )}
        
        {error && (
          <div className="text-red-500 text-center p-2 bg-red-50 rounded-md">
            {error}
          </div>
        )}
        
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-2">Transcription</h3>
          <div className="min-h-[100px] p-3 bg-gray-50 rounded-md">
            {isTranscribing ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-500">Transcribing...</span>
              </div>
            ) : (
              <p className="whitespace-pre-wrap">
                {transcription || "Record something to see the transcription here..."}
              </p>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-center">
        <Button
          variant="outline"
          onClick={startRecording}
          disabled={isRecording || isTranscribing}
        >
          Start New Recording
        </Button>
      </CardFooter>
    </Card>
  )
}