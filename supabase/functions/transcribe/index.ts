
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import OpenAI from 'https://esm.sh/openai@4.20.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY'),
    })

    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get the request body
    const requestData = await req.json()
    const audioData = requestData.audio

    if (!audioData) {
      return new Response(JSON.stringify({ error: 'No audio data provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log("Received audio data, processing...");

    // Convert base64 to Blob
    const base64Data = audioData.split(',')[1]
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'audio/webm' })
    
    console.log(`Audio blob created, size: ${blob.size} bytes`);

    // Create a File object from the blob
    const file = new File([blob], 'audio.webm', { type: 'audio/webm' })
    
    console.log("Calling OpenAI API...");

    // Call OpenAI API
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
    })

    console.log("OpenAI API response:", transcription);

    return new Response(JSON.stringify({ transcription }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})