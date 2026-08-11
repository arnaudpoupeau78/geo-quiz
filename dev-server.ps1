# Petit serveur statique pour tester Géo Quiz en local, sur Windows,
# sans installer Node ni Python.
#
#   powershell -ExecutionPolicy Bypass -File dev-server.ps1
#   puis ouvrir http://localhost:8765
#
# Indispensable pour tester le service worker et l'installation PWA :
# en double-cliquant sur index.html (file://) le jeu marche, mais pas
# le mode hors-ligne. Ce fichier ne sert qu'au développement.

param([int]$Port = 8765)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:$Port/"

$types = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/manifest+json; charset=utf-8"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "Géo Quiz servi depuis $root sur $prefix  (Ctrl+C pour arrêter)"

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $req = $ctx.Request
  $res = $ctx.Response

  $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
  $path = Join-Path $root ($rel -replace '/', '\')

  Write-Output "$($req.HttpMethod) /$rel"

  if (Test-Path -LiteralPath $path -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    $ct = $types[$ext]
    if (-not $ct) { $ct = "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $res.StatusCode = 200
    $res.ContentType = $ct
    # no-store : en dev, on veut toujours la dernière version du fichier
    $res.Headers.Add("Cache-Control", "no-store")
    $res.ContentLength64 = $bytes.Length
    # Une réponse à HEAD ne doit pas contenir de corps.
    if ($req.HttpMethod -ne "HEAD") {
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } else {
    $res.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - $rel")
    $res.ContentLength64 = $msg.Length
    $res.OutputStream.Write($msg, 0, $msg.Length)
  }
  $res.OutputStream.Close()
}
