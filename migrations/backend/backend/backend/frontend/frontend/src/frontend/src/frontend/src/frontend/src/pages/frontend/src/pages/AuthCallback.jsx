import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AuthCallback(){
  const navigate = useNavigate();
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if(token){
      localStorage.setItem('astra_token', token);
    }
    // Redirect home after storing token
    navigate('/');
  },[navigate]);
  return <div className="p-6">Signing in... Redirecting.</div>
}
