import React from 'react'
import PhotoBucket from '../components/PhotoBucket'

export default function Home(){
  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="font-bold text-xl">ASTRA</div>
          <div className="text-sm text-slate-600">Automated Smart Travel & Route Assistant</div>
        </div>
        <div>
          <a href="/auth/google" className="btn">Connect Google Calendar</a>
        </div>
      </header>
      <main className="mt-6 grid grid-cols-1 gap-4">
        <h2 className="text-lg font-semibold">Welcome to ASTRA</h2>
        <p className="text-sm text-slate-500">This is a demo home. Use the app to Plan, Add Partner, Upload Photos, and Sync Calendar.</p>
        <PhotoBucket/>
      </main>
    </div>
  )
}
