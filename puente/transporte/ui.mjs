// Transporte de respaldo: rellena el formulario de carga de horas. Más frágil
// que el XHR — cualquier rediseño de TimeBilling rompe los selectores.
// Ajustar SELECTORES contra la página real antes del primer uso.

const SELECTORES = {
  abrirFormulario: 'text="Nuevo trabajo"',
  fecha: 'input[name="string_date"]',
  proyecto: 'select[name="project_id"]',
  duracion: 'input[name="duration"]',
  descripcion: 'textarea[name="description"]',
  guardar: 'button[type="submit"]',
  confirmacion: 'text="Trabajo guardado"',
};

export async function enviar(pagina, hora) {
  await pagina.click(SELECTORES.abrirFormulario);
  await pagina.fill(SELECTORES.fecha, hora.fecha_local);
  await pagina.selectOption(SELECTORES.proyecto, String(hora.proyecto_id));
  await pagina.fill(SELECTORES.duracion, String(hora.duracion_min));
  await pagina.fill(SELECTORES.descripcion, hora.descripcion);
  await pagina.click(SELECTORES.guardar);

  try {
    await pagina.waitForSelector(SELECTORES.confirmacion, { timeout: 15000 });
  } catch {
    throw new Error("No apareció la confirmación de guardado; revisar en TimeBilling.");
  }

  // El formulario no devuelve el id; queda null y la hora se marca cargada igual.
  return { id: null };
}
