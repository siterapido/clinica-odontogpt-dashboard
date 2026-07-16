/**
 * Passos legíveis de trabalho do agente (padrão AG-UI "thinking steps",
 * sem chain-of-thought cru). Client-side v1.
 */

export function buildWorkSteps({ text = '', hasImage = false, hasFiles = false } = {}) {
  const t = String(text || '').toLowerCase()
  const isReport =
    /relat[oó]rio|apresenta|pauta|executivo|briefing formal|formato de entrega/.test(t)
  const isFinance = /caixa|financeiro|receber|cobran/.test(t)
  const isAgenda = /agenda|consulta|confirma|falta|ocupa/.test(t)

  if (hasImage || (/imagem|radiograf|rx|foto/.test(t) && hasFiles)) {
    return [
      'Abrindo o material que você enviou',
      'Descrevendo achados visíveis com cautela',
      'Preparando orientação para a clínica',
    ]
  }
  if (isReport) {
    return [
      'Coletando o estado atual da clínica',
      'Estruturando a entrega formal',
      'Revisando clareza e prioridades',
    ]
  }
  if (isFinance) {
    return [
      'Lendo indicadores financeiros do briefing',
      'Priorizando riscos de caixa e a receber',
      'Montando recomendações práticas',
    ]
  }
  if (isAgenda) {
    return [
      'Consultando agenda e confirmações de hoje',
      'Identificando lacunas e riscos de falta',
      'Sugerindo próximos passos operacionais',
    ]
  }
  return [
    'Lendo o estado da clínica',
    'Cruzando prioridades e alertas',
    'Preparando a resposta para o gestor',
  ]
}

export function missionStatusLabel({ sending, statusHint, listening }) {
  if (listening) return 'Ouvindo sua ordem…'
  if (sending) {
    if (statusHint) return statusHint
    return 'Trabalhando na sua ordem…'
  }
  return 'Observando a operação'
}
