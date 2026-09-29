export const el = (tag, cls = '', text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });
export function button(text, action, cls = 'button') { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', action); return b; }
export function link(text, href, cls = 'button secondary') { const a = el('a', cls, text); a.href = href; if(href.startsWith('https://')) { a.target='_blank'; a.rel='noopener noreferrer'; } return a; }
export function field(label, name, { type = 'text', multiline = false, required = true, minLength, maxLength, value = '', placeholder = '' } = {}) {
  const wrap = el('label', 'field'); wrap.append(el('span','',label));
  const input = document.createElement(multiline ? 'textarea' : 'input');
  if(!multiline) input.type=type;
  input.name=name; input.required=required; input.value=value; input.placeholder=placeholder;
  if(minLength) input.minLength=minLength; if(maxLength) input.maxLength=maxLength;
  wrap.append(input); return wrap;
}
export function heading(kicker, title, description) {
  const box = el('section', 'hero');box.append(el('p','eyebrow',kicker),el('h1','',title),el('p','description',description));return box;
}
export function pre(value) { return el('pre','evidence',value); }
export function message(text = '') { const p=el('p','form-message',text);p.setAttribute('role','status');return p; }
export async function api(path, options = {}) {
  const controller = new AbortController(); const timeout=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await fetch(path,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) {
      const text = typeof data.detail==='string' ? data.detail : Array.isArray(data.detail) ? data.detail.map(e=>`${e.loc?.at(-1)||'Field'}: ${e.msg}`).join(' · ') : `Request failed (${response.status})`;
      const error=new Error(text);error.status=response.status;throw error;
    }
    return data;
  } catch(error) { if(error.name==='AbortError') throw new Error('The server took too long to respond. Please retry.');throw error; }
  finally { clearTimeout(timeout); }
}
export function bindForm(form, action, status) {
  form.addEventListener('submit',async event=>{
    event.preventDefault();const submit=form.querySelector('[type="submit"]');submit.disabled=true;status.textContent='Saving…';
    try { await action(Object.fromEntries(new FormData(form))); } catch(error) {status.textContent=error.message;}
    finally {submit.disabled=false;}
  });
}
export function submitButton(text) { const b=el('button','button',text);b.type='submit';return b; }
