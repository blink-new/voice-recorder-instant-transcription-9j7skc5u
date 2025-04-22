
import { useState, useRef, useEffect } from 'react'
import { Mic, Square, Loader2, Play, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import lamejs from 'lamejs'

export function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioInputRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mp3EncoderRef = useRef<any>(null)
  const mp3DataRef = useRef<Int8Array[]>([])
  const timerRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
      stopRecording()
    }
  }, [audioUrl])

  // Handle audio playback state changes
  useEffect(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleEnded = () => setIsPlaying(false);

      audioElement.addEventListener('play', handlePlay);
      audioElement.addEventListener('pause', handlePause);
      audioElement.addEventListener('ended', handleEnded);

      return () => {
        audioElement.removeEventListener('play', handlePlay);
        audioElement.removeEventListener('pause', handlePause);
        audioElement.removeEventListener('ended', handleEnded);
      };
    }
  }, [audioRef.current]);

  const startRecording = async () => {
    try {
      setError(null)
      setTranscription('')
      setAudioBlob(null)
      setAudioUrl(null)
      mp3DataRef.current = []
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      
      streamRef.current = stream
      
      // Initialize AudioContext and nodes for MP3 encoding
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      
      const audioInput = audioContext.createMediaStreamSource(stream)
      audioInputRef.current = audioInput
      
      // Create ScriptProcessorNode for audio processing
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      
      // Initialize MP3 encoder
      const mp3Encoder = new lamejs.Mp3Encoder(1, audioContext.sampleRate, 128)
      mp3EncoderRef.current = mp3Encoder
      
      // Process audio data
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        
        // Convert float32 to int16
        const samples = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          // Scale to int16 range and clamp
          samples[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32768)))
        }
        
        // Encode to MP3
        const mp3Data = mp3Encoder.encodeBuffer(samples)
        if (mp3Data.length > 0) {
          mp3DataRef.current.push(mp3Data)
        }
      }
      
      // Connect the nodes
      audioInput.connect(processor)
      processor.connect(audioContext.destination)
      
      // Start recording
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
    if (isRecording) {
      setIsRecording(false)
      
      // Clear timer
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      
      // Finalize MP3 encoding
      if (mp3EncoderRef.current) {
        const finalMp3 = mp3EncoderRef.current.flush()
        if (finalMp3.length > 0) {
          mp3DataRef.current.push(finalMp3)
        }
        
        // Combine all MP3 chunks
        let totalLength = 0
        mp3DataRef.current.forEach(data => {
          totalLength += data.length
        })
        
        const mp3Data = new Uint8Array(totalLength)
        let offset = 0
        
        mp3DataRef.current.forEach(data => {
          mp3Data.set(data, offset)
          offset += data.length
        })
        
        // Create MP3 blob
        const audioBlob = new Blob([mp3Data], { type: 'audio/mp3' })
        console.log("Recording completed. MP3 size:", Math.round(audioBlob.size / 1024), "KB")
        setAudioBlob(audioBlob)
        
        // Create audio URL for playback
        const url = URL.createObjectURL(audioBlob)
        setAudioUrl(url)
      }
      
      // Clean up audio processing
      if (processorRef.current && audioInputRef.current) {
        audioInputRef.current.disconnect()
        processorRef.current.disconnect()
      }
      
      // Close AudioContext
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
      
      // Stop all tracks from the stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }

  const transcribeAudio = async () => {
    if (!audioBlob) {
      setError('No audio recorded')
      return
    }
    
    setIsTranscribing(true)
    setTranscription('')
    
    try {
      // Convert blob to base64
      const reader = new FileReader()
      reader.readAsDataURL(audioBlob)
      
      reader.onloadend = async () => {
        const base64Audio = reader.result as string
        console.log("Audio size for transcription:", Math.round(base64Audio.length / 1024), "KB")
        
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
        // Ensure audio is loaded and ready to play
        audioRef.current.load();
        const playPromise = audioRef.current.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("Audio playback started successfully");
            })
            .catch(error => {
              console.error("Audio playback failed:", error);
              setError("Failed to play audio. Please try recording again.");
            });
        }
      }
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
        <CardTitle className="text-2xl font-bold">Voice Recorder (MP3)</CardTitle>
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
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={togglePlayback}
                className="h-12 w-12 rounded-full"
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </Button>
              
              <div className="text-sm text-gray-500">
                {isPlaying ? "Playing..." : "Click to play recording"}
              </div>
              
              {/* Actual audio element */}
              <audio 
                ref={audioRef}
                src={audioUrl} 
                controls
                className="w-full mt-2"
                onError={(e) => {
                  console.error("Audio error:", e);
                  setError("Error playing audio. Please try recording again.");
                }}
              />
            </div>
            
            <div className="flex justify-center">
              <Button 
                onClick={transcribeAudio} 
                disabled={isTranscribing}
                className="mt-2"
              >
                Transcribe Recording
              </Button>
            </div>
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