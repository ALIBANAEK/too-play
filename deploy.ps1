# Deployment Script for Expanding Chess
$remoteUser = "abel"
$remoteHost = "77.133.242.89"
$remotePort = "22222"
$localDir = "C:\Users\Gerault\Documents\too-play"

Write-Host "--- Début du déploiement ---" -ForegroundColor Cyan

# 1. Upload des fichiers
Write-Host "[1/3] Upload des fichiers vers le serveur..." -ForegroundColor Yellow
scp -P $remotePort -r "$localDir" "${remoteUser}@${remoteHost}:~"

# 2. Exécution du script de configuration à distance (avec terminal interactif pour sudo)
Write-Host "[2/3] Configuration du serveur et redémarrage Nginx..." -ForegroundColor Yellow
ssh -p $remotePort -t "${remoteUser}@${remoteHost}" "bash ~/too-play/chess-variant/server/deploy_server.sh"

Write-Host "[3/3] Déploiement terminé ! Le serveur de jeu tourne sur le port 888." -ForegroundColor Green
Write-Host "URL du jeu : http://${remoteHost}/too-play/chess-variant/index.html" -ForegroundColor Cyan
