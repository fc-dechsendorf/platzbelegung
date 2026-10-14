// Initial setup is complete. Retired without privileged keys or Auth operations.
Deno.serve(() => new Response(JSON.stringify({
  error: 'Die Ersteinrichtung ist abgeschlossen. Dieser Endpunkt ist stillgelegt.'
}), {
  status: 410,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
}));

