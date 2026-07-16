import { useState, useEffect, useRef, useCallback } from 'react'
import { GraduationCap, Send, Paperclip, Loader2, Sparkles } from 'lucide-react'
import { getEstudantesMensagens, enviarEstudantesChat, uploadAgentFile } from '../api'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const ALUNO_KEY = 'odontogpt_estudante_nome'

export default function OdontoEstudantes() {
  const [msgs,setMsgs]=useState([]); const [lastId,setLastId]=useState(0); const [error,setError]=useState(null)
  const [texto,setTexto]=useState(''); const [sending,setSending]=useState(false)
  const [aluno,setAluno]=useState(()=>localStorage.getItem(ALUNO_KEY)||'Estudante')
  const [loading,setLoading]=useState(true); const [pendingFiles,setPendingFiles]=useState([])
  const bottomRef=useRef(null); const fileRef=useRef(null)
  const load=useCallback((after=0)=>getEstudantesMensagens(aluno,{after_id:after,limit:120}).then(d=>{
    const batch=d.data||[]; if(after>0) setMsgs(p=>{const ids=new Set(p.map(m=>m.id)); return [...p,...batch.filter(m=>!ids.has(m.id))]})
    else setMsgs(batch); if(batch.length) setLastId(Math.max(...batch.map(m=>m.id),after))}).catch(setError).finally(()=>setLoading(false)),[aluno])
  useEffect(()=>{setLoading(true);setMsgs([]);setLastId(0);load(0)},[load])
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[msgs,sending])
  async function onPickFiles(e){const files=Array.from(e.target.files||[]); e.target.value=''; const next=[...pendingFiles]
    for(const f of files.slice(0,5-next.length)){const up=await uploadAgentFile(f); next.push({...up.anexo,localName:f.name})} setPendingFiles(next)}
  async function sendMessage(textOverride){const text=(textOverride??texto).trim(); const ids=pendingFiles.map(f=>f.id)
    if(!text&&!ids.length) return; localStorage.setItem(ALUNO_KEY,aluno.trim()||'Estudante'); setSending(true); setError(null)
    try{await enviarEstudantesChat(text,aluno.trim()||'Estudante',ids); setTexto(''); setPendingFiles([]); await load(lastId)}catch(ex){setError(ex)}finally{setSending(false)}}
  const quick=['Explique cárie radicular','Roteiro anamnese dor aguda','Abscesso periapical vs periodontal']
  if(loading) return <Loading label="Carregando tutor…" />
  return (<div className="flex h-full min-h-[640px] flex-col gap-4">
    <header className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card flex flex-wrap items-center gap-3">
      <GraduationCap className="text-accent" size={22}/><div><h1 className="font-display text-lg font-semibold text-ink">Odonto Estudantes</h1>
      <p className="text-sm text-muted">Tutor Hermes — estudo (não substitui aula nem diagnóstico).</p></div>
      <Input className="ml-auto max-w-[200px]" value={aluno} onChange={e=>setAluno(e.target.value)} placeholder="Seu nome"/></header>
    {error&&<ErrorState error={error} onRetry={()=>load(0)}/>}
    <div className="flex flex-1 flex-col rounded-2xl border border-border-subtle bg-surface-2 shadow-card">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">{msgs.length===0&&<p className="text-sm text-muted">Faça uma pergunta ao tutor.</p>}
        {msgs.map(m=>(<div key={m.id} className={m.role==='user'?'text-right':''}><div className={"inline-block max-w-[90%] rounded-xl px-3 py-2 text-sm "+(m.role==='user'?'bg-accent/15 text-ink':'bg-surface text-ink border border-border-subtle')}>{m.conteudo}</div></div>))}
        <div ref={bottomRef}/></div>
      <div className="flex flex-wrap gap-2 border-t border-border-subtle p-3">{quick.map(q=>(<button key={q} type="button" className="rounded-full border border-border-subtle px-3 py-1 text-xs" onClick={()=>sendMessage(q)} disabled={sending}><Sparkles size={12} className="inline mr-1"/>{q}</button>))}</div>
      <form onSubmit={e=>{e.preventDefault();sendMessage()}} className="flex gap-2 border-t border-border-subtle p-3">
        <input ref={fileRef} type="file" className="hidden" multiple accept="image/*,.pdf" onChange={onPickFiles}/>
        <Button type="button" variant="outline" size="icon" onClick={()=>fileRef.current?.click()}><Paperclip size={16}/></Button>
        <Input value={texto} onChange={e=>setTexto(e.target.value)} placeholder="Pergunte…" className="flex-1"/>
        <Button type="submit" disabled={sending}>{sending?<Loader2 className="animate-spin" size={16}/>:<Send size={16}/>}</Button></form></div></div>)
}
