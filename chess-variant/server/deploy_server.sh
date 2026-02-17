#!/bin/bash
# Script de déploiement côté serveur (exécuté via SSH)

echo "--- Configuration du serveur ---"

# 1. Mise à jour des fichiers Web
sudo rm -rf /var/www/html/too-play
sudo mv ~/too-play /var/www/html/
sudo chown -R www-data:www-data /var/www/html
sudo chmod -R 755 /var/www/html/too-play

# 2. Redémarrage de Nginx
sudo systemctl restart nginx

# 3. Configuration du serveur Node.js (Multijoueur)
sudo chown -R abel:abel /var/www/html/too-play
cd /var/www/html/too-play/chess-variant/server

echo "--- Installation des dépendances ---"
npm install

# 4. Lancement du serveur (Utilisation de PM2 ou background)
echo "--- Lancement du serveur de jeu (Port 888) ---"
# On tue l'ancien serveur s'il existe
sudo pkill -f "node server.js" || true

# On lance le nouveau en arrière-plan avec setsid pour qu'il persiste après la déconnexion
NODE_PATH=$(which node)
sudo setsid $NODE_PATH server.js > /tmp/server.log 2>&1 &
sleep 3

# Vérification finale
echo "--- Vérification du port 888 ---"
if sudo ss -tulpn | grep -q ":888"; then
    echo "Le serveur écoute bien sur le port 888."
else
    echo "ATTENTION: Le serveur ne semble pas écouter sur le port 888."
    echo "Dernières lignes du log :"
    cat /tmp/server.log
fi

echo "Serveur lancé avec succès !"
