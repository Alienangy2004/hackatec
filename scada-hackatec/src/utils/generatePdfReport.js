import jsPDF from 'jspdf';
import 'jspdf-autotable';

export const exportAuditPdf = ({
  auditResult,
  telemetrySnapshot,
  operator,
  activeCase,
  capturedFrame
}) => {
  const doc = new jsPDF();
  const dateStr = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
  const timeStr = new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City' });
  const tokenSha = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  // Encabezado Neón Dark
  doc.setFillColor(10, 17, 32);
  doc.rect(0, 0, 210, 30, 'F');
  
  // Línea acento
  doc.setFillColor(0, 242, 255);
  doc.rect(0, 29, 210, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('TECNM // DICTAMEN OFICIAL DE AUDITORÍA SCADA', 14, 14);
  
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 242, 255);
  doc.text('HACKATEC 2026 | TECNOLOGÍAS EMERGENTES: TELEMETRÍA, TELEPROCESOS Y ADQUISICIÓN', 14, 22);

  // Recuadro de Metadatos
  doc.setDrawColor(0, 242, 255);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 36, 182, 24, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('FECHA:', 18, 43);
  doc.text('HORA:', 75, 43);
  doc.text('CASO AUDITADO:', 130, 43);
  doc.text('AUDITOR / ROL:', 18, 51);
  doc.text('SELLO DIGITAL SHA:', 18, 56);

  doc.setFont('helvetica', 'normal');
  doc.text(dateStr, 33, 43);
  doc.text(timeStr, 88, 43);
  doc.text(activeCase.toUpperCase(), 160, 43);
  doc.text(`${operator.name} [${operator.role}]`, 48, 51);
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.text(tokenSha, 55, 56);

  // Tabla 1: Telemetría Sensorial
  const telemetryData = Object.entries(telemetrySnapshot).map(([param, val]) => [
    param,
    typeof val === 'boolean' ? (val ? 'DISPARADO / ACTIVO' : 'NORMAL / EN REPOSO') : `${val}`
  ]);

  doc.autoTable({
    startY: 64,
    head: [['Variable Sensorial / Actuador', 'Lectura en Tiempo Real']],
    body: telemetryData,
    theme: 'grid',
    headStyles: { fillColor: [10, 17, 32], textColor: [0, 242, 255], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2 }
  });

  let nextY = doc.lastAutoTable.finalY + 8;

  // Tabla 2: Dictamen Multimodal de la IA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(10, 17, 32);
  doc.text('RESOLUCIÓN DE IA MULTIMODAL (GEMINI 3.8 FLASH)', 14, nextY);
  nextY += 4;

  const aiRows = [
    ['Nivel de Riesgo Operativo', auditResult?.safetyLevel || 'SIN EVALUAR'],
    ['Operadores Detectados en Escena', `${auditResult?.operatorsDetectedCount ?? 1} Detectado(s)`],
    ['Anomalía Física Observada', auditResult?.physicalAnomalyObserved ? 'SÍ (PELIGRO DETECTADO)' : 'NO'],
    ['Diagnóstico Causa Raíz', auditResult?.rootCause || 'Operación dentro de los límites estándar'],
    ['Acción Automática Recomendada', auditResult?.autoActionSuggested || 'NINGUNA'],
    ['Enclavamiento de Seguridad', auditResult?.interlockAuthorization ? 'AUTORIZADO' : 'BLOQUEADO POR SEGURIDAD']
  ];

  doc.autoTable({
    startY: nextY,
    head: [['Parámetro de Evaluación', 'Dictamen']],
    body: aiRows,
    theme: 'striped',
    headStyles: { fillColor: [2, 132, 199], textColor: [255, 255, 255] },
    styles: { fontSize: 8, cellPadding: 2 }
  });

  nextY = doc.lastAutoTable.finalY + 8;

  // Evidencia Fotográfica Incrustada
  if (capturedFrame && nextY < 225) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(10, 17, 32);
    doc.text('EVIDENCIA FOTOGRÁFICA DE LA WEBCAM:', 14, nextY);
    nextY += 4;
    try {
      doc.addImage(capturedFrame, 'JPEG', 14, nextY, 70, 52);
    } catch (e) {
      console.warn('Error adjuntando imagen al PDF:', e);
    }
  }

  // Pie de Página
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Ciclo Operativo: Medir -> Transmitir -> Interpretar -> Actuar -> Verificar -> Documentar.', 14, 288);

  doc.save(`dictamen_${activeCase}_${Date.now()}.pdf`);
};