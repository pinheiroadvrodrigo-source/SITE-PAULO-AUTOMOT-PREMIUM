/* Funções compartilhadas: Supabase, blog, vídeos e contador de acessos */
(function(){
  const ok = window.SUPABASE_URL && /^https:\/\//.test(window.SUPABASE_URL) && window.SUPABASE_ANON_KEY && !/COLE_AQUI/.test(window.SUPABASE_ANON_KEY);
  const PSA = window.PSA = { ready: false, sb: null };
  if (ok && window.supabase) {
    PSA.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    PSA.ready = true;
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  PSA.esc = esc;

  PSA.slugify = t => String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || ('post-' + Date.now());

  PSA.date = d => { try { return new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}) } catch(e){ return '' } };

  /* Markdown simples (o ChatGPT entrega texto assim) -> HTML seguro */
  PSA.md = function(src){
    const inline = s => esc(s)
      .replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g,'<img src="$2" alt="$1" loading="lazy">')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>');
    const lines = String(src||'').replace(/\r/g,'').split('\n');
    let html='', list=null, para=[];
    const flushP=()=>{ if(para.length){ html+='<p>'+inline(para.join(' '))+'</p>'; para=[]; } };
    const flushL=()=>{ if(list){ html+='</'+list+'>'; list=null; } };
    for (let raw of lines){
      const l = raw.trim();
      let m;
      if(!l){ flushP(); flushL(); continue; }
      if((m=l.match(/^(#{1,4})\s+(.*)$/))){ flushP(); flushL(); const n=Math.min(4,Math.max(2,m[1].length+1)); html+=`<h${n}>${inline(m[2])}</h${n}>`; continue; }
      if((m=l.match(/^[-*•]\s+(.*)$/))){ flushP(); if(list!=='ul'){ flushL(); html+='<ul>'; list='ul'; } html+='<li>'+inline(m[1])+'</li>'; continue; }
      if((m=l.match(/^\d+[.)]\s+(.*)$/))){ flushP(); if(list!=='ol'){ flushL(); html+='<ol>'; list='ol'; } html+='<li>'+inline(m[1])+'</li>'; continue; }
      if((m=l.match(/^>\s?(.*)$/))){ flushP(); flushL(); html+='<blockquote>'+inline(m[1])+'</blockquote>'; continue; }
      if(/^(-{3,}|\*{3,})$/.test(l)){ flushP(); flushL(); html+='<hr>'; continue; }
      if(/^!\[[^\]]*\]\(https?:[^)]+\)$/.test(l)){ flushP(); flushL(); html+='<figure>'+inline(l)+'</figure>'; continue; }
      flushL(); para.push(l);
    }
    flushP(); flushL();
    return html;
  };

  /* Link de vídeo -> player */
  PSA.videoEmbed = function(url){
    if(!url) return '';
    const u = String(url).trim(); let m;
    if((m=u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/)))
      return `<div class="vid ${/shorts/.test(u)?'vert':''}"><iframe src="https://www.youtube.com/embed/${m[1]}" title="Vídeo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    if((m=u.match(/instagram\.com\/(?:[\w.]+\/)?(reel|p|tv)\/([\w-]+)/)))
      return `<div class="vid vert"><iframe src="https://www.instagram.com/${m[1]}/${m[2]}/embed" title="Vídeo do Instagram" allowfullscreen loading="lazy" scrolling="no"></iframe></div>`;
    if((m=u.match(/tiktok\.com\/.*\/video\/(\d+)/)))
      return `<div class="vid vert"><iframe src="https://www.tiktok.com/embed/v2/${m[1]}" title="Vídeo do TikTok" allowfullscreen loading="lazy"></iframe></div>`;
    if(/\.(mp4|webm|mov)(\?|$)/i.test(u))
      return `<div class="vid file"><video src="${esc(u)}" controls playsinline preload="metadata"></video></div>`;
    return `<p><a class="btn btn-gold" href="${esc(u)}" target="_blank" rel="noopener">▶ Assistir ao vídeo</a></p>`;
  };

  PSA.thumb = function(p){
    if(p.capa_url) return p.capa_url;
    const m = p.video_url && p.video_url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/);
    if(m) return 'https://i.ytimg.com/vi/'+m[1]+'/hqdefault.jpg';
    return 'img/logo.png';
  };

  PSA.card = function(p){
    const href = 'post.html?s=' + encodeURIComponent(p.slug);
    return `<a class="pcard" href="${href}">
      <div class="pimg"><img src="${esc(PSA.thumb(p))}" alt="${esc(p.titulo)}" loading="lazy">${p.tipo==='video'?'<span class="play">▶</span>':''}</div>
      <div class="pbody"><span class="ptag">${p.tipo==='video'?'🎬 Vídeo':'📝 Artigo'}</span>
      <h3>${esc(p.titulo)}</h3><p>${esc(p.resumo||'')}</p><small>${PSA.date(p.criado_em)}</small></div></a>`;
  };

  /* Contador de acessos (1 vez por sessão por página) */
  PSA.track = function(slug){
    if(!PSA.ready) return;
    const key = 'psa_v_' + location.pathname + (slug||'');
    try { if(sessionStorage.getItem(key)) return; sessionStorage.setItem(key,'1'); } catch(e){}
    let ref = '';
    try { if(document.referrer){ const h = new URL(document.referrer).hostname.replace(/^www\./,''); if(h !== location.hostname.replace(/^www\./,'')) ref = h; } } catch(e){}
    const p = new URLSearchParams(location.search);
    if(!ref && p.get('utm_source')) ref = p.get('utm_source');
    if(!ref && p.get('gclid')) ref = 'Google Ads';
    const device = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'celular' : 'computador';
    PSA.sb.rpc('register_view', { p_path: location.pathname || '/', p_slug: slug || null, p_ref: ref || null, p_device: device }).then(()=>{}, ()=>{});
  };
})();
