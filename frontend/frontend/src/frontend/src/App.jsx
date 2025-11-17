import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import AuthCallback from './pages/AuthCallback'

export default function App(){
  return (
    <Routes>
      <Route path="/" element={<Home/>} />
      <Route path="/auth/callback" element={<AuthCallback/>} />
    </Routes>
  )
}
