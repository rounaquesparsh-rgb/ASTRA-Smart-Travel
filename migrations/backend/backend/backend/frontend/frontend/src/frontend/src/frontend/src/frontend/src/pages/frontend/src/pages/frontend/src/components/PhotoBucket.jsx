import React from 'react'

export default function PhotoBucket(){
  const [preview, setPreview] = React.useState('');
  async function handleFile(e){
    const file = e.target.files?.[0];
    if(!file) return;
    const token = localStorage.getItem('astra_token');
    // request signature from backend
    try{
      const signRes = await fetch('/api/upload/sign', { headers: { Authorization: `Bearer ${token}` } });
      if(!signRes.ok){
        // fallback: server-side upload
        const fd = new FormData(); fd.append('file', file);
        const r = await fetch('/api/upload', { method: 'POST', body: fd, headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json(); setPreview(j.url); return;
      }
      const sig = await signRes.json();
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', sig.api_key);
      form.append('timestamp', sig.timestamp);
      form.append('signature', sig.signature);
      form.append('public_id', sig.public_id);
      form.append('folder', 'astra');
      const cloud = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/auto/upload`, { method: 'POST', body: form });
      const cloudJson = await cloud.json();
      setPreview(cloudJson.secure_url);
    }catch(err){
      console.error(err);
      alert('Upload failed');
    }
  }
  return (
    <div className="p-3 bg-white rounded shadow-sm">
      <h3 className="font-semibold">Photo Bucket</h3>
      <input type="file" accept="image/*" onChange={handleFile} />
      {preview && <img src={preview} alt="preview" className="mt-2 w-full rounded" />}
    </div>
  )
}
