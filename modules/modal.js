export class modal {
    constructor(params={}) {
        var me = this;
        this.id = params.id ? params.id : "UserModal";
        this.titre = params.titre ? params.titre : "Message";
        this.body = params.body ? params.body : "";
        this.boutons = params.boutons ? params.boutons : [{'name':"Close"}];
        this.size = params.size ? params.size : '';
        this.class = params.class ? params.class : '';
        var m, mBody, mFooter;
        this.init = function () {
            //ajoute la modal pour les messages
            let html = `
                <div class="modal-dialog ${me.size}">
                <div class="modal-content ${me.class}">
                    <div class="modal-header">
                    <h5 class="modal-title">${me.titre}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                    ${me.body}                    
                    </div>                          
                    <div class="modal-footer">
                    </div>
                </div>
                </div>
            `;
            d3.select('#modal'+me.id).remove();
            let sm = d3.select('body').append('div')
                .attr('id','modal'+me.id).attr('class','modal').attr('tabindex',-1);
            sm.html(html);
            m = new bootstrap.Modal('#modal'+me.id);
            mBody = sm.select('.modal-body');
            mFooter = sm.select('.modal-footer');
            me.setBoutons();
        }
        this.setBoutons = function(boutons=false){
            if(boutons)me.boutons=boutons;
            mFooter.selectAll('button').remove();
            me.boutons.forEach(b=>{
                switch (b.name) {
                    case 'Close':
                        mFooter.append('button').attr('type',"button").attr('class',"btn btn-secondary")
                            .attr('data-bs-dismiss',"modal").html(b.name);
                        break;                
                    default:
                        mFooter.append('button').attr('type',"button").attr('class',"btn "+b.class)
                            .on('click',b.fct).html(b.name);
                        break;
                }
            })
        }
        this.add = function(p){
            let s=d3.select('#'+p);
            //ajoute la modal si inexistant
            if(s.empty()){
                s = d3.select('body').append('div')
                    .attr('id',p).attr('class','modal').attr('tabindex',-1);
                s.html(eval(p));
            }
            return {'m':new bootstrap.Modal('#'+p),'s':s};
        }
        this.setBody = function(html){
            mBody.html(html);
        }
        this.show = function(){
            m.show();
        }
        this.hide = function(){
            m.hide();
        }

        this.init();
    }
}
//modal pour modifier une notebox 
export let modalNodeBox = `
    <div class="modal-dialog modal-xl">
    <div class="modal-content">
        <div class="modal-header text-bg-warning">
        <h5 class="modal-title">Modifier la note</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body text-bg-dark">
            <h4 id="inptTitreNote"></h4>
            <div class="row mb-3">
                <div class="col-6">
                    <audio id="audioNote" src="../omk_deleuze/files/original/c7a476293b34292e1b899828623c50d0dc862e18.flac" class="mx-2" controls="true" style="height: 24px;"></audio>
                </div>              
                <div class="col-6">
                <label id="inptAuteurNote" class="form-label">Description</label>
                </div>    
            </div>    
            <div class="row">
                <div class="col-6">
                    <div class="input-group h-100">
                        <span class="input-group-text">Description</span>
                        <textarea class="form-control" id="inptDescNote" rows="3"></textarea>
                    </div>  
                </div>              
                <div class="col-6">
                    <div class="row">
                        <div class="col-8">
                            <div class="input-group mb-3">
                                <span class="input-group-text">Couleur</span>
                                <input type="color" class="form-control form-control-color" id="inptNoteColor" value="#ffc00870" title="Choisir une couleur">
                            </div>              
                        </div>              
                        <div class="col-2">
                            <a id="aShareNote" class="link-danger" target="_blank" href=""><i class="fa-light fa-share"></i></a>
                        </div>              
                        <div class="col-2">
                            <a id="aOmkNote" target="_blank" href=""><img src="assets/img/OmekaS.png" style="height: 20px;"></a>
                        </div>              
                    </div>              
                    <div class="row">
                        <div class="input-group">
                            <span class="input-group-text">Début & fin</span>
                            <input id="inptNoteDeb" disabled type="text" aria-label="Début" class="form-control">
                            <input type="hidden" id="inptNoteDebVal" value="" />
                            <input id="inptNoteFin" disabled type="text" aria-label="Fin" class="form-control">
                            <input type="hidden" id="inptNoteFinVal" value="" />
                            <input type="hidden" id="inptIdFrag" value="" />
                            <input type="hidden" id="inptIdTrans" value="" />
                            <input type="hidden" id="inptIdNote" value="" />                
                        </div>
                    </div>              
                </div>    
            </div>    
            <div class="row mb-3 mt-3">
                <div class="input-group">
                    <span class="input-group-text" id="inputGroupTransOri">Transcription</span>
                    <input id="inptConceptNote" type="text" class="form-control" aria-label="Transcription originale" aria-describedby="inputGroupTransOri">
                    <button id="btnShowConceptOccur" class="btn btn-success" type="button" id="button-addon2">Voir les occurences</button>
                </div>                
            </div>
            <div class="row" id="noteListeOccurence">
                <div class="clearfix" id="hstConceptTrans" ></div>
            </div>
            <div class="row mb-3">
                <div class="input-group">
                    <span class="input-group-text" id="inputGroupTransCorrection">Correction</span>
                    <input type="text" class="form-control" placeholder="Choisir/créer un concept" aria-label="Choisir/créer un concept" aria-describedby="inputGroupTransCorrection">
                    <button class="btn btn-danger" type="button">Appliquer</button>
                </div>
            </div>
            <nav class="navbar navbar-expand-lg bg-body-tertiary">
                <div class="container-fluid">
                    <a class="navbar-brand" href="#">Ajouter</a>
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nbNodeBox" aria-controls="nbNodeBox" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                    </button>
                    <div class="collapse navbar-collapse" id="nbNodeBox">
                    <ul class="navbar-nav">
                        <li class="nav-item">
                            <button id="btnAddPerson" type="button" class="btn btn-warning"><i class="fa-solid fa-person"></i></button>
                        </li>
                        <li class="nav-item">
                            <button id="btnAddGeo" type="button" class="btn btn-warning"><i class="fa-solid fa-book-atlas"></i></button>
                        </li>     
                        <li class="nav-item">
                            <button id="btnAddEpoque" type="button" class="btn btn-warning"><i class="fa-light fa-timeline-arrow"></i></button>
                        </li>                       
                        <li class="nav-item">
                            <button id="btnAddBook" type="button" class="btn btn-warning"><i class="fa-solid fa-book"></i></button>
                        </li>
                        <li class="nav-item">
                            <button id="btnAddMovie" type="button" class="btn btn-warning"><i class="fa-solid fa-film"></i></button>
                        </li>
                        <li class="nav-item">
                            <button id="btnAddMusic" type="button" class="btn btn-warning"><i class="fa-solid fa-music"></i></button>
                        </li>                        
                        <li class="nav-item">
                            <button id="btnAddLink" type="button" class="btn btn-warning"><i class="fa-solid fa-link"></i></button>                
                        </li>
                        <li class="nav-item">
                            <button id="btnAddConcept" type="button" class="btn btn-warning"><i class="fa-solid fa-diagram-project"></i></button>                
                        </li>                        
                    </ul>
                    </div>
                </div>
            </nav>
            <h4>Référence(s) associée(s)</h4>    
            <h5>Personne(s)</h5>    
            <div id="lstNodeBoxPerson" class="list-group">
            </div> 
            <h5>Lieu(x)</h5>    
            <div id="lstNodeBoxGeo" class="list-group">
            </div> 
            <h5>Epoque(s)</h5>    
            <div id="lstNodeBoxEpoque" class="list-group">
            </div> 
            <h5>Document(s)</h5>    
            <div id="lstNodeBoxDoc" class="list-group">
            </div> 
            <h5>Films(s)</h5>    
            <div id="lstNodeBoxFilm" class="list-group">
            </div> 
            <h5>Musique(s)</h5>    
            <div id="lstNodeBoxMusique" class="list-group">
            </div> 
            <h5>Liens</h5>    
            <div id="lstNodeBoxLink" class="list-group">
            </div> 
            <h5>Concepts</h5>    
            <div id="lstNodeBoxConcept" class="d-flex flex-wrap">
            </div> 

        </div>                          
        <div class="modal-footer text-bg-warning">
            <button id="btnNodeBoxClose" type="button" class="btn btn-secondary">Fermer</button>        
            <button id="btnNodeBoxDelete" type="button" class="btn btn-danger">Supprimer</button>        
            <button id="btnNodeBoxSave" type="button" class="btn btn-success">Enregistrer</button>        
        </div>
    </div>
    </div>
`;
//modal pour ajouter une référence
export let modalAddRef = `
    <div class="modal-dialog ">
    <div class="modal-content">
        <div class="modal-header text-bg-warning">
        <h5 id="modalAddRefTitre" class="modal-title">Ajouter une personne</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body text-bg-dark">
            <div class="mb-3">
                <label id="inptChercheLabel" for="inptCherche" class="form-label">Nom de la personne</label>
                <input type="text" class="form-control" id="inptCherche" >
            </div>
            <nav class="navbar navbar-expand-lg bg-body-tertiary">
            <div class="container-fluid">
                <a class="navbar-brand" href="#">Rechercher</a>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nbAddRefFind" aria-controls="nbAddRefFind" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse" id="nbAddRefFind">
                <div class="navbar-nav">
                    <div class="btn-group" role="group" aria-label="Basic example">
                <button id="btnFindRefBnF" type="submit" class="btn"><img src="assets/img/Logo_BnF.svg"  height="32px" /></button>
                <button id="btnFindRefWikidata" type="submit" class="btn"><img src="assets/img/Wikidata-logo.svg.png" height="40px" /></button>
                    </div>                
                </div>
            </div>
            </nav>
            <div id='hstRefFind' />
        </div>                          
        <div class="modal-footer text-bg-warning">
            <button id="btnAddRefClose" type="button" class="btn btn-secondary">Fermer</button>        
            <button id="btnAddRefSave" type="button" class="btn btn-success">Enregistrer</button>        
        </div>
    </div>
    </div>
`;
//modal pour gérer un concept
export let modalShowConcept = `
    <div class="modal-dialog modal-xl">
    <div class="modal-content">
        <div class="modal-header text-bg-warning">
            <h5 class="modal-title">Gestion d'un concept</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body text-bg-dark">
            <h1 id="modalShowConceptTitre">Titre du concept</h1>
            <div class="mb-3">
                <label for="inptChangeConceptTitle" class="form-label">Changer le titre du concept</label>
                <input id="inptChangeConceptTitle" type="search" dir="ltr" spellcheck=false autocorrect="off" autocomplete="off" autocapitalize="off" maxlength="2048" tabindex="1"></input>
            </div>
            <div id="timelineConceptTrans" style="height:480px;" />
            <div class="clearfix" id="hstConceptTrans" />
        </div>                          
        <div class="modal-footer text-bg-warning">
            <button id="btnShowConceptClose" type="button" class="btn btn-secondary">Fermer</button>        
            <button id="btnShowConceptSave" type="button" class="btn btn-success">Enregistrer</button>        
        </div>
    </div>
    </div>
`;