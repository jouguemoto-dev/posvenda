import { Obra, Servico } from '../types';

export function buildObraGCalTitle(obra: Partial<Obra>, teamOverride?: string): string {
  const team = teamOverride || obra.equipe || 'Sem Equipe';
  const cliente = obra.cliente || 'Cliente';
  if (obra.quantidadePlacas && Number(obra.quantidadePlacas) > 0) {
    return `${cliente}(${obra.quantidadePlacas} placas), ${team}`;
  }
  return `${cliente}, ${team}`;
}

export function buildServicoGCalTitle(servico: Partial<Servico>, teamOverride?: string): string {
  const team = teamOverride || servico.equipeServico || servico.equipeInstalou || 'Sem Equipe';
  const cliente = servico.cliente || 'Cliente';
  return `${cliente}, ${team}`;
}

export function createGoogleCalendarUrl(params: {
  title: string;
  details?: string;
  location?: string;
  startDateStr: string; // YYYY-MM-DD
  endDateStr?: string;   // YYYY-MM-DD
  startTime?: string;   // HH:MM
  endTime?: string;     // HH:MM
}): string {
  const { 
    title, 
    details = '', 
    location = '', 
    startDateStr, 
    endDateStr = startDateStr, 
    startTime = '08:00', 
    endTime = '17:00' 
  } = params;

  if (!startDateStr) return '';

  const cleanStartDate = startDateStr.split('T')[0];
  const cleanEndDate = endDateStr.split('T')[0];

  const [startYear, startMonth, startDay] = cleanStartDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = cleanEndDate.split('-').map(Number);

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const startDt = new Date(startYear, startMonth - 1, startDay, startH || 8, startM || 0);
  const endDt = new Date(endYear, endMonth - 1, endDay, endH || 17, endM || 0);

  const formatGCalDate = (d: Date) => {
    return d.toISOString().replace(/-|:|\.\d\d\d/g, '');
  };

  const datesParam = `${formatGCalDate(startDt)}/${formatGCalDate(endDt)}`;

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  url.searchParams.set('dates', datesParam);
  if (details) url.searchParams.set('details', details);
  if (location) url.searchParams.set('location', location);

  return url.toString();
}

export function generateObraGCalUrl(obra: Obra, dateOverride?: string, teamOverride?: string): string {
  const dateStr = dateOverride || obra.dataObra;
  if (!dateStr) return '';

  const team = teamOverride || obra.equipe || 'Sem Equipe';
  const title = buildObraGCalTitle(obra, team);
  
  const details = [
    `👤 Cliente: ${obra.cliente}`,
    `🔢 Registro: #${obra.numeroRegistro}`,
    `🛠️ Equipe: ${team}`,
    `💼 Vendedor: ${obra.vendedor || '---'}`,
    `⚡ Inversor: ${obra.inversor || '---'}`,
    `☀️ Placas: ${obra.quantidadePlacas || 0} módulos`,
    `📍 Endereço: ${obra.local || 'Não informado'}`,
    `📊 Prioridade: ${obra.prioridade || 'Média'}`,
    `📈 Situação: ${obra.situacao || 'Pendente'}`,
    obra.observacoes ? `📝 Observações: ${obra.observacoes}` : ''
  ].filter(Boolean).join('\n');

  return createGoogleCalendarUrl({
    title,
    details,
    location: obra.local || '',
    startDateStr: dateStr,
    startTime: '08:00',
    endTime: '17:00'
  });
}

export function generateServicoGCalUrl(servico: Servico, dateOverride?: string, teamOverride?: string): string {
  const dateStr = dateOverride || servico.dataServico;
  if (!dateStr) return '';

  const team = teamOverride || servico.equipeServico || servico.equipeInstalou || 'Sem Equipe';
  const title = buildServicoGCalTitle(servico, team);

  const details = [
    `👤 Cliente: ${servico.cliente}`,
    `🔢 Registro: #${servico.numeroRegistro}`,
    `🛠️ Equipe: ${team}`,
    `🔧 Serviço: ${servico.servico || 'Não informado'}`,
    `💼 Vendedor: ${servico.vendedor || '---'}`,
    `📍 Endereço: ${servico.local || 'Não informado'}`,
    `📊 Prioridade: ${servico.prioridade || 'Média'}`,
    `📈 Situação: ${servico.situacao || 'Pendente'}`,
    servico.observacao ? `📝 Observações: ${servico.observacao}` : ''
  ].filter(Boolean).join('\n');

  return createGoogleCalendarUrl({
    title,
    details,
    location: servico.local || '',
    startDateStr: dateStr,
    startTime: '08:00',
    endTime: '17:00'
  });
}

export async function autoCreateGoogleCalendarEvent(params: {
  title: string;
  details?: string;
  location?: string;
  startDateStr: string;
  startTime?: string;
  endTime?: string;
}, accessToken?: string | null): Promise<{ success: boolean; url: string }> {
  const { title, details = '', location = '', startDateStr, startTime = '08:00', endTime = '17:00' } = params;
  
  const url = createGoogleCalendarUrl({
    title,
    details,
    location,
    startDateStr,
    startTime,
    endTime
  });

  if (!startDateStr) return { success: false, url: '' };

  if (accessToken) {
    try {
      const cleanDate = startDateStr.split('T')[0];
      const startIso = `${cleanDate}T${startTime}:00`;
      const endIso = `${cleanDate}T${endTime}:00`;
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';

      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: title,
          description: details,
          location,
          start: { dateTime: new Date(startIso).toISOString(), timeZone },
          end: { dateTime: new Date(endIso).toISOString(), timeZone }
        })
      });

      if (res.ok) {
        return { success: true, url };
      }
    } catch (err) {
      console.warn('Google Calendar API error, falling back to URL:', err);
    }
  }

  return { success: false, url };
}
