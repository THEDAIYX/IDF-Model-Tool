$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$server = Join-Path $project 'server.mjs'

if (-not (Test-Path -LiteralPath $server)) {
    Write-Host "server.mjs was not found: $server" -ForegroundColor Red
    exit 1
}

# Prefer PATH Node.js, then try common installation folders.
$nodePath = $null
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($null -ne $nodeCommand) {
    $nodePath = $nodeCommand.Source
}
if (-not $nodePath) {
    $nodeCandidates = @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
        (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
    )
    foreach ($candidate in $nodeCandidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            $nodePath = $candidate
            break
        }
    }
}

if ($nodePath) {
    Write-Host "Node.js: $nodePath" -ForegroundColor DarkGray
    $nodeProcess = $null
    $freePort = -1
    for ($candidatePort = 4173; $candidatePort -le 4183; $candidatePort++) {
        $env:PORT = [string]$candidatePort
        $candidateProcess = Start-Process -FilePath $nodePath -ArgumentList @($server) -WorkingDirectory $project -WindowStyle Hidden -PassThru
        Start-Sleep -Milliseconds 900
        if (-not $candidateProcess.HasExited) {
            $nodeProcess = $candidateProcess
            $freePort = $candidatePort
            break
        }
    }
    if (-not $nodeProcess) {
        Write-Host "The server could not bind to ports 4173 through 4183." -ForegroundColor Red
        exit 1
    }
    $url = "http://127.0.0.1:$freePort/"
    Write-Host "Platform started: $url" -ForegroundColor Green
    Start-Process $url
    $nodeProcess.WaitForExit()
    exit $nodeProcess.ExitCode
}

# Without Node.js, use the built-in HttpListener as a static server.
Write-Host 'Node.js not found; using the built-in static server.' -ForegroundColor Yellow
$freePort = 4173
$url = "http://127.0.0.1:$freePort/"

$webRoot = [IO.Path]::GetFullPath((Join-Path $project 'public'))
$listener = New-Object -TypeName Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()
Write-Host "Platform started: $url" -ForegroundColor Green
Start-Process $url
$mime = @{
    '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8';
    '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg';
    '.jpeg' = 'image/jpeg'; '.wasm' = 'application/wasm'; '.xml' = 'application/xml; charset=utf-8'
}
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response
        try {
            $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
            $file = [IO.Path]::GetFullPath((Join-Path $webRoot $relative))
            if (-not $file.StartsWith($webRoot, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
                $response.StatusCode = 404
                continue
            }
            $bytes = [IO.File]::ReadAllBytes($file)
            $extension = [IO.Path]::GetExtension($file).ToLowerInvariant()
            if ($mime.ContainsKey($extension)) {
                $response.ContentType = $mime[$extension]
            } else {
                $response.ContentType = 'application/octet-stream'
            }
            $response.ContentLength64 = $bytes.Length
            if ($context.Request.HttpMethod -ne 'HEAD') { $response.OutputStream.Write($bytes, 0, $bytes.Length) }
        } finally {
            $response.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
