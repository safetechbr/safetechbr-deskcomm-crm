#!/usr/bin/env bash
# Uma vaga do executor próprio num Mac com Docker Desktop (sem sysbox: o
# contêiner roda --privileged para ter o próprio dockerd). Mesma lógica de
# vaga.sh: credencial JIT de uso único, um job por contêiner, contêiner
# destruído no fim. Usa o login do `gh` (precisa de admin no repo).
# Mantido no ar pelo launchd: com.deskcomm.vaga-mac.plist.
#
# shortcut: --privileged dá ao job root na VM do Docker Desktop; aceitável
# porque a guarda só deixa rodar jobs do próprio repo. Máquina dedicada: use
# instalar.sh (Linux + sysbox).
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO="${DESKCOMM_REPO:-safetechbr/safetechbr-deskcomm-crm}"
CPUS="${DESKCOMM_CPUS:-4}"
MEMORIA="${DESKCOMM_MEMORIA:-7g}"
IMAGEM=deskcomm-vaga
CONTEINER=deskcomm-vaga-mac

while true; do
  nome="deskcomm-vaga-mac-$(date +%s)"
  cfg=$(gh api -X POST "repos/${REPO}/actions/runners/generate-jitconfig" \
      -f name="$nome" -F runner_group_id=1 -f 'labels[]=deskcomm-proprio' -f work_folder=_work \
      --jq '.encoded_jit_config' 2>/dev/null) || cfg=""
  [ -n "$cfg" ] || { echo "vaga-mac: GitHub recusou a credencial (gh sem login ou sem admin?) — nova tentativa em 60s" >&2; sleep 60; continue; }

  docker rm -f "$CONTEINER" >/dev/null 2>&1 || true
  echo "vaga-mac: ${nome} pronto, esperando job"
  JIT_CONFIG="$cfg" docker run --rm --privileged \
    --name "$CONTEINER" --cpus "$CPUS" --memory "$MEMORIA" \
    -e JIT_CONFIG "$IMAGEM"
  echo "vaga-mac: ${nome} terminou (código $?)"
  sleep 2
done
