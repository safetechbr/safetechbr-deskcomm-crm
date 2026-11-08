# Mídias proporcionais no atendimento

Destino: núcleo. MediaRenderer e as notas internas já consomem ImageMedia/VideoMedia; a mudança se aplica aos dois caminhos.

O navegador informa naturalWidth/naturalHeight no carregamento da imagem e videoWidth/videoHeight nos metadados do vídeo. proporcaoDaMidia limita a visualização a 384 × 512, sem ampliar arquivos menores, e o aspect-ratio preserva o formato ao reduzir a largura da conversa. A troca de arquivo reinicia medidas e carregamento por chave de fonte. Enquanto as dimensões são desconhecidas, o esqueleto ocupa uma caixa provisória. Erros continuam exibindo MediaUnavailable.

Verificação: 75 testes passaram em quatro arquivos, incluindo orientação vertical/horizontal/quadrada, dimensões, carregamento, falhas, lightbox, troca de fonte e bolhas. No navegador, o vídeo real da conversa foi medido com 576 × 1024 pixels originais e 288 × 512 pixels exibidos, sem moldura horizontal. Não houve reprodução, envio ou alteração de mensagens. O E2E completo não foi executado por ausência do ambiente isolado .env.e2e.

Checklist Sistema Vivo: entrada nos eventos de carregamento do arquivo; saída no tamanho da mídia em ImageMedia/VideoMedia; porta na conversa existente; estado visível pelo esqueleto ou aviso de indisponibilidade; sem nova configuração ou mutação operacional a auditar; sem alteração da continuidade de atendimento. O ciclo de falha conserva o aviso e a troca de fonte reinicia o componente. Arestas: MediaRenderer/notas → componentes de mídia → proporcaoDaMidia → caixa proporcional; imagem → lightbox e vídeo → controles nativos preservados.
