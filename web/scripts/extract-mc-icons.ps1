param(
  [string]$MinecraftDir = $(if ($env:MINECRAFT_DIR) { $env:MINECRAFT_DIR } else { "E:\Games\PrismLauncher\instances\All the Mods 10 - 6.1\minecraft" })
)

$ErrorActionPreference = "Stop"

$ModsDir = Join-Path $MinecraftDir "mods"
$Root = Resolve-Path "."
$OutDir = Join-Path $Root "public\assets\mc-icons"
$ManifestPath = Join-Path $OutDir "manifest.json"

if (-not (Test-Path -LiteralPath $ModsDir)) {
  throw "Mods directory not found: $ModsDir"
}

if (Test-Path -LiteralPath $OutDir) {
  Remove-Item -LiteralPath $OutDir -Recurse -Force
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Manifest = [ordered]@{}
$Extracted = 0
$Jars = Get-ChildItem -LiteralPath $ModsDir -Filter "*.jar" -File

function Read-ZipText($Entry) {
  $Stream = $Entry.Open()
  try {
    $Reader = [System.IO.StreamReader]::new($Stream)
    try {
      return $Reader.ReadToEnd()
    } finally {
      $Reader.Dispose()
    }
  } finally {
    $Stream.Dispose()
  }
}

function Copy-ZipEntry($Entry, [string]$TargetPath) {
  $TargetDir = Split-Path -Parent $TargetPath
  if (-not (Test-Path -LiteralPath $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
  }

  $InputStream = $Entry.Open()
  try {
    $OutputStream = [System.IO.File]::Open($TargetPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    try {
      $InputStream.CopyTo($OutputStream)
    } finally {
      $OutputStream.Dispose()
    }
  } finally {
    $InputStream.Dispose()
  }
}

foreach ($Jar in $Jars) {
  try {
    $Zip = [System.IO.Compression.ZipFile]::OpenRead($Jar.FullName)
  } catch {
    continue
  }

  try {
    $Entries = @{}
    foreach ($Entry in $Zip.Entries) {
      $Entries[$Entry.FullName] = $Entry
    }

    foreach ($Entry in $Zip.Entries) {
      if ($Entry.FullName -notmatch '^assets/([^/]+)/models/item/(.+)\.json$') {
        continue
      }

      $ModelNamespace = $Matches[1]
      $ItemPath = $Matches[2]
      $ResourceId = "${ModelNamespace}:${ItemPath}"
      if ($Manifest.Contains($ResourceId)) {
        continue
      }

      try {
        $Model = Read-ZipText $Entry | ConvertFrom-Json
      } catch {
        continue
      }

      $Layer0 = $Model.textures.layer0
      if (-not $Layer0 -or $Layer0 -isnot [string]) {
        continue
      }

      if ($Layer0.Contains(":")) {
        $Parts = $Layer0.Split(":", 2)
        $TextureNamespace = $Parts[0]
        $TexturePath = $Parts[1]
      } else {
        $TextureNamespace = $ModelNamespace
        $TexturePath = $Layer0
      }

      $TextureArchivePath = "assets/$TextureNamespace/textures/$TexturePath.png"
      if (-not $Entries.ContainsKey($TextureArchivePath)) {
        continue
      }

      $TargetPath = Join-Path $OutDir "$ModelNamespace\$ItemPath.png"
      Copy-ZipEntry $Entries[$TextureArchivePath] $TargetPath
      $Manifest[$ResourceId] = "/assets/mc-icons/$ModelNamespace/$ItemPath.png"
      $Extracted += 1
    }
  } finally {
    $Zip.Dispose()
  }
}

$Manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
Write-Host "Extracted $Extracted icons from $($Jars.Count) jars into $OutDir"
