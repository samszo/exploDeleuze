import {loader} from './loader.js';
import {modal} from './modal.js';
import { transcription } from './transcription.js';

export class anythingLLM {
    constructor(params={}) {
        var me = this;
        this.modal;
        this.apikey = params.apikey ? params.apikey : false;
        this.workspace = params.workspace ? params.workspace : false;
        this.endpoint = params.endpoint ? params.endpoint : 'http://localhost:3001/api/v1/';
        this.loader = new loader();
        this.navbar = params.navbar ? params.navbar : d3.select('#navbarIA');
        this.a = params.a ? params.a : false;
        this.omk = params.omk ? params.omk : false;
        this.cont = params.cont ? params.cont : false;
        this.contParams = params.contParams ? params.contParams : false;
        this.fct = params.fct ? params.fct : false;
        this.modal;
        this.m;
        this.user;
        let oWorkspace, userThreads;
                
        this.init = function () {
            if(me.workspace){
                //récupère les infos de l'utilisateur
                me.getUserInfo().then(e=>{
                    //récupère les infos du workspace
                    me.getWorkspace();
                });
            }
        } 

        this.getUserInfo = async function(){
            let rs = await query('admin/users','GET',{});
            me.user = rs.users.filter(u=>u.username==me.omk.user.anythingLLM.login)[0];
        }

        function setModal(){

            if(!me.navbar.size())return;
            let htmlNavBar = `<div class="btn-group">            
                    <button id="btnShowAnythingLLM" class="btn btn-outline-danger" ><i class="fa-light fa-microchip-ai"></i></button>
                </div>`;
            me.navbar.append('li').attr('class',"nav-item ms-2 me-1").html(htmlNavBar);
            let htmlModal = `
                <div class="modal-dialog">
                <div class="modal-content text-bg-dark">
                    <div class="modal-header">
                    <h5 class="modal-title">Conversations avec l'IA</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
<nav class="navbar navbar-expand-lg bg-body-tertiary bg-dark border-bottom border-bottom-dark"
                    data-bs-theme="dark">
  <div class="container-fluid">
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nbAnythingLLM" aria-controls="nbAnythingLLM" aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="nbAnythingLLM">
      <ul class="navbar-nav me-auto mb-2 mb-lg-0">
        <li class="nav-item">
            <button id="btnUpdateRef" type="button" class="btn btn-danger"
            data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="Mettre à jour les documents de références">
                <i class="fa-light fa-file-pen"></i>
            </button>
        </li>
        <li class="nav-item">
            <button id="btnAddThread" type="button" class="btn btn-danger"
            data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="Nouvelle discussion">
                <i class="fa-light fa-message"></i>
            </button>
        </li>
        <li class="nav-item dropdown">        
          <a class="nav-link dropdown-toggle btn btn-danger" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false"
          data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="Choisir une discussion"
          >
            <i class="fa-light fa-messages"></i>
          </a>
          <ul id="ddAnythingLLMListeThread" class="dropdown-menu">
          </ul>
        </li>

      </ul>
    </div>
  </div>
</nav>

                    </div>                          
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button id='btnCheck' style="visibility:visible;" type="button" class="btn btn-primary">Check</button>
                    </div>
                </div>
                </div>
            `;
            me.m = d3.select('body').append('div')
                .attr('id','modalAnythingLLM').attr('class','modal').attr('tabindex',-1);
            me.m.html(htmlModal);
            me.modal = new bootstrap.Modal('#modalAnythingLLM');
            me.navbar.select("#btnShowAnythingLLM").on('click',e=>{
                me.modal.show();
            });
            d3.select('#btnUpdateRef').on('click',updateDocIA)
            //active les tooltip
            const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
            const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))            
        }
        
        this.getWorkspace = async function(){
            let r = await query('workspace/'+me.workspace,'GET',{});
            if(r.workspace.length){
                oWorkspace=r.workspace[0];
                //transforme les infos des documents
                oWorkspace.documents.forEach(d=>{
                    d.infos = JSON.parse(d.metadata);
                    d.idOmk = parseInt(d.infos.title.split('-')[1].split('.')[0]) 
                });
                //affiche le bouton de tchat IA
                setModal();                

                //récupère les fils de discussion
                userThreads = oWorkspace.threads.filter(t=>t.user_id==me.user.id);
                setMenu('#ddAnythingLLMListeThread', userThreads,'slug',showThread);
                
            }
            console.log(oWorkspace);
        }

        function showThread(e,t){
            query('workspace/'+me.workspace+'/thread/'+t.slug+'/chats','GET',{}).then(rt=>{
                console.log(rt);
                if(me.fct && me.fct.showThread)me.fct.showThread('btnShowAnythingLLM');
                me.contParams.selectAll('*').remove();
                let params = me.contParams.append('div').attr('class',"btn-group")
                    .attr('role',"group").attr('aria-label',"Outils de dialogue");
                params.append('button').attr('type',"button").attr('class',"btn btn-outline-danger")
                    .html('<i class="fa-light fa-message-question"></i>')
                    .on('click',(e,d)=>console.log(rt))
                params.append('button').attr('type',"button").attr('class',"btn btn-outline-danger")
                    .html('<i class="fa-light fa-person-circle-question"></i>')
                    .on('click',(e,d)=>console.log(rt))

                me.cont.selectAll('*').remove();
                let ul = me.cont.append('ul').attr('class',"list-group"),
                li = ul.selectAll('li').data(rt.history).enter()
                    .append('li').attr('class',t=>{
                        let c = "list-group-item ";
                        c += t.role=="user" ? "list-group-item-light" : "list-group-item-dark";
                        return c;
                    }),
                div = li.append('div').attr('class','d-flex w-100 justify-content-between')
                div.append('div').html(t=>t.role == "user" ? 
                    '<i class="fa-light fa-user"></i>' : '<i class="fa-light fa-robot"></i>');
                div.append('h5').attr('class','mb-1')
                    .text(t=>t.role);
                li.append('p').attr('class',"mb-1 text-start")
                    .text(t=>t.content);
                let docs = li.append('div').attr('class',"btn-group")
                    .attr('role',"group").attr('aria-label',"Documents liés");
                docs.selectAll('button').data(t=>{
                    return t.sources ? t.sources : [];
                    }).enter()
                    .append('button').attr('type',"button").attr('class',"btn btn-outline-danger")
                    .html('<i class="fa-light fa-file-audio fa-xl"></i>')
                    .on('click',showTranscription)
            })
        }

        function showTranscription(e,d){
            me.loader.show();
            let id = d.title.split('-')[1].split('.')[0],
                url = me.omk.api.replace('api/','')
                    +"s/cours-bnf/page/ajax?json=1&helper=sql&action=timelineConcept&getTrans="+id;                               
            d3.json(url).then(function(rs) {
                let t = new transcription({
                    'a':me.a,
                    'cont':d3.select("#contentResources"),
                    'contParams':d3.select('#contentResourcesParams'),  
                    'vals':rs,
                    'selectConcepts': []
                })
            });

        }

        function updateDocIA(e,d){
            if(!me.omk){
                let m=new modal({
                    'titre':"Impossible de mettre à jour les documents",
                    'body':"Vous n'êtes pas connecté à la base de données.",
                    'class':'text-bg-dark'
                })
                m.show();
                return;
            }
            me.loader.show();
            //récupère la liste des docs
            ///v1/document/create-folder
            //me.omk.getAllItems('resource_class_id=412',
            me.omk.searchItems('resource_class_id=412',
                    data=>{
                    data.forEach((d,i) => {
                        if(!docInWorkspace(d)){
                            let txt = 
                                "#"+d["ma:isFragmentOf"][0].display_title+'\n'
                                +"##"+d["oa:hasSource"][0].display_title+'\n'
                                +d['o:title'],
                            params = {
                                "textContent": txt,
                                "metadata": {
                                    "title":"Transcription "+d['o:id'],
                                    "idTrans": d['o:id'],
                                    "docSource":d['ma:isFragmentOf'][0]['value_resource_id'],
                                    "description":"cours_"+d['ma:isFragmentOf'][0]['value_resource_id']
                                        +"-frag_"+d['oa:hasSource'][0]['value_resource_id'],
                                    "idSource": d['oa:hasSource'][0]['value_resource_id'],
                                    "idCours": d['ma:isFragmentOf'][0]['value_resource_id']
                                }
                            }
                            //Ajoute le document dans anythingLLM
                            query('document/raw-text','POST',params).then(r=>{
                                console.log(r);
                                docAddToWorkspace(r);
                            });
                        }
                    });
                    me.loader.hide();
                },false
            );
        }

        function docMoveToFolder(r,f){
            //création du dossier 
            query('document/create-folder','POST',{"name": f}).then(f=>{
                //déplacement du doc dans le dossier
                let params = {
                        "files": [
                            {
                            "from": r["location"],
                            "to": r["location"].replace("custom-documents",f)
                            }
                        ]
                    },
                move = query('document/move-files','POST',params);
                //TODO:mettre à jour le worspace 
                //en supprimant l'ancien fichier et en ajoutant le nouveau
            });

        }

        function docAddToWorkspace(r){
            //ajoute le document dans le workspace
            let params = {
                "adds": [
                  r.documents[0].location
                ]
              }    
            query('workspace/'+me.workspace+'/update-embeddings','POST',params).then(r=>{
                console.log(r);
            });
        }

        function docInWorkspace(d){
            return oWorkspace.documents.filter(od=>od.idOmk==d['o:id']).length;
        }

        async function query(a,m,b={}) {
            let params = {
                method: m,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer '+me.apikey
                }
            };
            if(m=='POST')params.body=JSON.stringify(b);
            const response = await fetch(me.endpoint+a,params);
            return await response.json();
        }     

        this.init();
    }
}
