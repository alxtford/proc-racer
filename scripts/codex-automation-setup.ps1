param(
  [switch]$SkipInstallDeps,
  [switch]$RequireGh
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  $root = git rev-parse --show-toplevel 2>$null
  if (-not $root) {
    throw "Not inside a git worktree."
  }

  return $root.Trim()
}

function Set-GhAutomationEnv {
  if ($env:GH_TOKEN -or $env:GITHUB_TOKEN) {
    return
  }

  $sharedGhConfig = Join-Path $HOME ".codex\gh-cli"
  $hostsPath = Join-Path $sharedGhConfig "hosts.yml"
  if (Test-Path $hostsPath) {
    $env:GH_CONFIG_DIR = $sharedGhConfig
    return
  }

  if ($RequireGh) {
    throw "GitHub CLI auth is not configured for automations. Expected $hostsPath."
  }
}

function Install-RepoDependencies {
  param(
    [string]$RepoRoot
  )

  $packageJson = Join-Path $RepoRoot "package.json"
  $lockFile = Join-Path $RepoRoot "package-lock.json"
  $nodeModules = Join-Path $RepoRoot "node_modules"

  if (-not (Test-Path $packageJson) -or -not (Test-Path $lockFile)) {
    return
  }

  $needsInstall = -not (Test-Path $nodeModules)
  if (-not $needsInstall) {
    $lockTime = (Get-Item $lockFile).LastWriteTimeUtc
    $modulesTime = (Get-Item $nodeModules).LastWriteTimeUtc
    $needsInstall = $lockTime -gt $modulesTime
  }

  if ($needsInstall) {
    Push-Location $RepoRoot
    try {
      npm install
    } finally {
      Pop-Location
    }
  }
}

$repoRoot = Get-RepoRoot
Set-GhAutomationEnv

if (-not $SkipInstallDeps) {
  Install-RepoDependencies -RepoRoot $repoRoot
}

Write-Output "RepoRoot=$repoRoot"
if ($env:GH_TOKEN) {
  Write-Output "GitHubAuth=GH_TOKEN"
} elseif ($env:GITHUB_TOKEN) {
  Write-Output "GitHubAuth=GITHUB_TOKEN"
} elseif ($env:GH_CONFIG_DIR) {
  Write-Output "GitHubAuth=GH_CONFIG_DIR"
  Write-Output "GH_CONFIG_DIR=$($env:GH_CONFIG_DIR)"
} else {
  Write-Output "GitHubAuth=Unavailable"
}
