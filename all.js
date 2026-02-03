#!/usr/bin/env node
/* ======================================================
 UIX v0.3 all.js
 One-file compiler + runtime
 SQL CRUD + list item templates
====================================================== */

const fs=require("fs");

/* ================ OPS ================ */
const OPS={
APP:"app", UI:"ui", DB:"db", TABLE:"table",
FN:"fn", COLUMN:"column", ROW:"row",
TEXT:"text", INPUT:"input", BUTTON:"button",
LIST:"list", ITEM:"item", INSERT:"insert",
REFRESH:"refresh", DELETE:"delete", UPDATE:"update", WHERE:"where"
};

/* ================ TOKENIZER ================ */
function tokenize(code){
  return code.replace(/\/\/.*$/gm,"")
    .replace(/\{/g," { ").replace(/\}/g," } ")
    .split(/\s+/).filter(Boolean);
}

/* ================ PARSER ================ */
function parse(tokens){
  let i=0;
  const next=()=>tokens[i++];

  function block(){const b=[]; while(tokens[i]!=="}") b.push(node()); i++; return b;}
  function node(){
    const t=next();
    switch(t){
      case OPS.APP: return {type:"app",name:next().replace(/"/g,"")};
      case OPS.UI: next(); return {type:"ui",body:block()};
      case OPS.COLUMN: next(); return {type:"column",body:block()};
      case OPS.ROW: next(); return {type:"row",body:block()};
      case OPS.TEXT: return {type:"text",value:next().replace(/"/g,"")};
      case OPS.INPUT: return {type:"input",kind:next(),id:next()};
      case OPS.BUTTON: return {type:"button",label:next().replace(/"/g,""),fn:next()};
      case OPS.LIST: {const table=next(); let body=[]; if(tokens[i]==="{"){next(); body=block();} return {type:"list",table,body};}
      case OPS.ITEM: next(); return {type:"item",body:block()};
      case OPS.DB: next(); return {type:"db",body:block()};
      case OPS.TABLE: const n=next(); next(); return {type:"table",name:n,fields:block()};
      case OPS.FN: const f=next(); next(); return {type:"fn",name:f,body:block()};
      case OPS.INSERT: return {type:"insert",table:next(),value:next()};
      case OPS.REFRESH: return {type:"refresh",table:next()};
      case OPS.DELETE: return {type:"delete",table:next()};
      case OPS.UPDATE: return {type:"update",table:next()};
      case OPS.WHERE: return {type:"where",cond:tokens[i++]};
      default: return {type:"raw",value:t};
    }
  }

  const ast=[];
  while(i<tokens.length) ast.push(node());
  return ast;
}

/* ================ GENERATOR ================ */
function generate(ast){
  let html="", css="", js="", tables=[];

  css+=`
body{font-family:sans-serif;padding:20px}
.col{display:flex;flex-direction:column;gap:10px}
.row{display:flex;gap:10px}
button{padding:6px 12px}
`;

  function walk(n){
    switch(n.type){
      case "ui": n.body.forEach(walk); break;
      case "column": html+=`<div class="col">`; n.body.forEach(walk); html+=`</div>`; break;
      case "row": html+=`<div class="row">`; n.body.forEach(walk); html+=`</div>`; break;
      case "text": html+=`<p>${n.value}</p>`; break;
      case "input": html+=`<input id="${n.id}" type="${n.kind}"/>`; break;
      case "button": html+=`<button onclick="${n.fn}()">${n.label}</button>`; break;
      case "list":
        html+=`<div data-list="${n.table}"></div>`;
        if(n.body.length){
          js+=`function render_${n.table}(){\n const el=document.querySelector('[data-list="${n.table}"]'); el.innerHTML=""; const res=DB.exec("SELECT * FROM ${n.table}"); if(!res.length) return;\n res[0].values.forEach(row=>{\n`;
          n.body.forEach(item=>{
            if(item.type==="item"){
              item.body.forEach(it=>{
                if(it.type==="text") js+=`const p=document.createElement("div"); p.textContent=row[1]; el.appendChild(p);\n`;
                if(it.type==="button") js+=`const b=document.createElement("button"); b.textContent="${it.label}"; b.onclick=()=>${it.fn}(row[0]); el.appendChild(b);\n`;
              });
            }
          });
          js+="});}\n";
        }
        break;
      case "table": tables.push(n); break;
      case "fn":
        js+=`function ${n.name}(arg){\n`;
        n.body.forEach(b=>{
          if(b.type==="insert") js+=`dbInsert("${b.table}",document.getElementById("${b.value}").value);\n`;
          if(b.type==="refresh") js+=`render_${b.table}();\n`;
          if(b.type==="delete") js+=`dbDelete("${b.table}",arg);\n render_${b.table}();\n`;
          if(b.type==="update") js+=`dbUpdate("${b.table}",arg,"new text");\n render_${b.table}();\n`;
        });
        js+="}\n";
        break;
    }
  }

  ast.forEach(walk);

  /* --- Runtime SQLite + CRUD --- */
  let runtime=`
<script src="https://sql.js.org/dist/sql-wasm.js"></script>
<script>
let DB=null;
async function initDB(){
  const SQL=await initSqlJs({locateFile:f=>"https://sql.js.org/dist/"+f});
  DB=new SQL.Database();
  ${tables.map(t=>`DB.run("CREATE TABLE IF NOT EXISTS ${t.name}(id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT)");`).join("\n")}
}

function dbInsert(table,value){DB.run("INSERT INTO "+table+"(text) VALUES(?)",[value]);}
function dbDelete(table,id){DB.run("DELETE FROM "+table+" WHERE id=?",[id]);}
function dbUpdate(table,id,value){DB.run("UPDATE "+table+" SET text=? WHERE id=?",[value,id]);}

(async()=>{await initDB(); ${tables.map(t=>`render_${t.name}();`).join("")}})();
</script>
`;

  return {html:`<!doctype html><html><head><style>${css}</style></head><body>${html}${runtime}<script>${js}</script></body></html>`};
}

/* ================ COMPILE ================= */
function compile(code){return generate(parse(tokenize(code)));}

/* ================ CLI ================= */
if(require.main===module){
  const file=process.argv[2];
  if(!file) return console.log("node all.js app.uix");
  const code=fs.readFileSync(file,"utf8");
  const out=compile(code);
  fs.mkdirSync("dist",{recursive:true});
  fs.writeFileSync("dist/index.html",out.html);
  console.log("✔ UIX build complete → dist/index.html");
}

module.exports={compile};
