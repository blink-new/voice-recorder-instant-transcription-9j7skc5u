
import { useState, useRef, useEffect } from 'react'
import { Mic, Square, Loader2, Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'

export function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isAudioVerified, setIsAudioVerified] = useState(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  const startRecording = async () => {
    try {
      setError(null)
      setTranscription('')
      setAudioBlob(null)
      setAudioUrl(null)
      setIsAudioVerified(false)
      audioChunksRef.current = []
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      })
      
      mediaRecorderRef.current = mediaRecorder
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setAudioBlob(audioBlob)
        
        // Create audio URL for playback
        const url = URL.createObjectURL(audioBlob)
        setAudioUrl(url)
        
        // Stop all tracks from the stream
        stream.getTracks().forEach(track => track.stop())
      }
      
      // Start recording
      mediaRecorder.start(1000) // Collect data every second
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

  const transcribeAudio = async () => {
    if (!audioBlob) {
      setError('No audio recorded')
      return
    }
    
    setIsAudioVerified(true)
    setIsTranscribing(true)
    setTranscription('')
    
    try {
      // Convert blob to base64
      const reader = new FileReader()
      reader.readAsDataURL(audioBlob)
      
      reader.onloadend = async () => {
        const base64Audio = reader.result as string
        console.log("Audio size:", Math.round(base64Audio.length / 1024), "KB")
        
        try {
          // Call Supabase Edge Function
          const { data, error } = await supabase.functions.invoke('transcribe', {
            body: { audio: base64Audio }
          })
          
          if (error) {
            console.error('Error from Edge Function:', error)
            setError(`Failed to transcribe audio: ${error.message}`)
            setIsTranscribing(false)
            return
          }
          
          console.log("Transcription response:", data)
          
          if (data && data.transcription && data.transcription.text) {
            setTranscription(data.transcription.text)
          } else {
            setError('Received empty transcription from server')
            console.error('Empty transcription data:', data)
          }
          
          setIsTranscribing(false)
        } catch (err) {
          console.error('Error calling Edge Function:', err)
          setError(`Error: ${err.message}`)
          setIsTranscribing(false)
        }
      }
    } catch (err) {
      console.error('Error transcribing audio:', err)
      setError('Failed to transcribe audio. Please try again.')
      setIsTranscribing(false)
    }
  }

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleAudioEnded = () => {
    setIsPlaying(false)
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
  }

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0])
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
      <CardContent className="space-y-6">
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
        
        {audioUrl && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={togglePlayback}
                className="h-10 w-10 rounded-full"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                className="h-8 w-8 rounded-full"
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              
              <div className="w-48">
                <Slider
                  value={[volume]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                />
              </div>
            </div>
            
            <audio 
              ref={audioRef}
              src={audioUrl} 
              className="hidden"
              onEnded={handleAudioEnded}
            />
            
            <div className="text-center text-sm text-gray-500">
              {isAudioVerified ? 
                "Audio verified and sent for transcription" : 
                "Please verify your audio before transcribing"
              }
            </div>
            
            {!isAudioVerified && (
              <div className="flex justify-center">
                <Button 
                  onClick={transcribeAudio} 
                  disabled={isTranscribing}
                  className="mt-2"
                >
                  Verify and Transcribe
                </Button>
              </div>
            )}
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