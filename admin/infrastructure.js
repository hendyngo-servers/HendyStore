(() => {
'use strict';
const $ = (s) => document.querySelector(s);
const snippets = {
  cloudfly: \`OBJECT_STORAGE_PROVIDER=cloudfly
OBJECT_STORAGE_ENDPOINT=https://s3.cloudfly.vn
OBJECT_STORAGE_REGION=hn
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
OBJECT_STORAGE_SESSION_TOKEN=
OBJECT_STORAGE_FORCE_PATH_STYLE=true
OBJECT_STORAGE_LEGACY_NEON_READ_FALLBACK=true\`,
  r2: \`OBJECT_STORAGE_PROVIDER=r2
CLOUDFLARE_ACCOUNT_ID=
OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
OBJECT_STORAGE_SESSION_TOKEN=
OBJECT_STORAGE_FORCE_PATH_STYLE=true
OBJECT_STORAGE_LEGACY_NEON_READ_FALLBACK=true\`,
  database: \`# Render / PHP currently uses Neon PostgreSQL
DATABASE_URL=postgresql://<role>:<password>@<host>/<database>?sslmode=require
# Cloudflare Workers use a Hyperdrive binding (secret connection string stays in Cloudflare)
DATABASE_PROVIDER=postgres
# Other Worker adapters: DATABASE_PROVIDER=mysql or d1
\`
};
function show(text) { const node=$('#configPreview'); if(node)node.textContent=text; }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();document.execCommand('copy');area.remove(); }
  const toast=$('#toast');if(toast){toast.textContent='Đã sao chép cấu hình.';toast.classList.add('show');window.setTimeout(()=>toast.classList.remove('show'),2500);}
}
document.addEventListener('click',(event)=>{
  const button=event.target.closest('[data-copy]');
  if(button){show(snippets[button.dataset.copy]||snippets.cloudfly);}
});
$('#copyCurrentConfig')?.addEventListener('click',()=>copy($('#configPreview')?.textContent||''));
$('#checkHealth')?.addEventListener('click',async()=>{
 const badge=$('#originHealth');badge.textContent='Đang kiểm tra…';badge.className='infra-badge';
 try{const response=await fetch(new URL('/api.php?action=health',window.location.origin),{cache:'no-store',headers:{Accept:'application/json'}});
 const data=await response.json();badge.textContent=response.ok&&data.ok?'API Healthy':'API '+response.status+' — cần kiểm tra Render/Neon';badge.className='infra-badge '+(response.ok&&data.ok?'ok':'err');}
 catch{badge.textContent='Không kết nối được API origin';badge.className='infra-badge err';}
});
})();