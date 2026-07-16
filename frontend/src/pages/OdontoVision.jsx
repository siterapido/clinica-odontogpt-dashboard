import { useState, useRef } from 'react'
import { Scan, Upload, Loader2, AlertTriangle } from 'lucide-react'
import { analyzeVisionImage } from '../api'
import ErrorState from '../components/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function fileToDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file)})}

export default function OdontoVision(){
  const [preview,setPreview]=useState(null); const [contexto,setContexto]=useState(''); const [result,setResult]=useState(null)
  const [disclaimer,setDisclaimer]=useState(''); const [error,setError]=useState(null); const [loading,setLoading]=useState(false); const fileRef=useRef(null)
  async function onFile(e){const f=e.target.files?.[0]; e.target.value=''; if(!f) return; if(!f.type.startsWith('image/')){setError(new Error('Envie uma imagem.')); return}
    setPreview(await fileToDataUrl(f)); setResult(null); setError(null)}
  async function analyze(){if(!preview) return; setLoading(true); setError(null); try{const res=await analyzeVisionImage(preview,contexto); setResult(res.analise); setDisclaimer(res.disclaimer||'')}catch(ex){setError(ex)}finally{setLoading(false)}}
  return (<div className="mx-auto max-w-3xl space-y-4">
    <header className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card flex items-center gap-3"><Scan className="text-accent" size={22}/>
      <div><h1 className="font-display text-lg font-semibold text-ink">Odonto Vision</h1><p className="text-sm text-muted">Análise assistiva Hermes — educacional.</p></div></header>
    {error&&<ErrorState error={error} onRetry={analyze}/>}
    <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card space-y-3">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
      <Button variant="outline" onClick={()=>fileRef.current?.click()}><Upload size={16} className="mr-2"/>Selecionar imagem</Button>
      {preview&&<img src={preview} alt="Prévia" className="max-h-80 rounded-lg border object-contain"/>}
      <Input value={contexto} onChange={e=>setContexto(e.target.value)} placeholder="Contexto opcional"/>
      <Button onClick={analyze} disabled={!preview||loading}>{loading?'Analisando…':'Analisar com Hermes'}</Button></div>
    {result&&<article className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card whitespace-pre-wrap text-sm text-ink">{result}
      {disclaimer&&<p className="mt-4 text-xs text-warning flex gap-2"><AlertTriangle size={14}/>{disclaimer}</p>}</article>}</div>)
}
