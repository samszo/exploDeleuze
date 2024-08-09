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
//ajoute la modal pour modifier une notebox 
export let modalNodeBox = `
    <div class="modal-dialog ">
    <div class="modal-content">
        <div class="modal-header text-bg-warning">
        <h5 class="modal-title">Modifier la note</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body text-bg-dark">
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
            <div class="mb-3">
                <label for="inptTitreNote" class="form-label">Titre</label>
                <input type="text" class="form-control" id="inptTitreNote" >
            </div>
            <div class="mb-3">
                <label for="inptDescNote" class="form-label">Description</label>
                <textarea class="form-control" id="inptDescNote" rows="3"></textarea>
            </div>  
            <div class="input-group mb-3">
                <span class="input-group-text">Début & fin</span>
                <input id="inptNoteDeb" disabled type="text" aria-label="Début" class="form-control">
                <input type="hidden" id="inptNoteDebVal" value="" />
                <input id="inptNoteFin" disabled type="text" aria-label="Fin" class="form-control">
                <input type="hidden" id="inptNoteFinVal" value="" />
                <input type="hidden" id="inptIdFrag" value="" />
                <input type="hidden" id="inptIdTrans" value="" />
            </div>
            <h5>Personne(s) associée(s)</5>    
            <div id="lstNodeBoxPerson" class="list-group">
            </div> 
            <h5>Document(s) associé(s)</5>    
            <div id="lstNodeBoxDoc" class="list-group">
            </div> 
            <h5>Films(s) associé(s)</5>    
            <div id="lstNodeBoxFilm" class="list-group">
            </div> 
            <h5>Musique(s) associée(s)</5>    
            <div id="lstNodeBoxMusique" class="list-group">
            </div> 
            <h5>Liens associée(s)</5>    
            <div id="lstNodeBoxLink" class="list-group">
            </div> 
            <h5>Concepts associé(s)</5>    
            <div id="lstNodeBoxConcept" class="list-group">
            </div> 

        </div>                          
        <div class="modal-footer text-bg-warning">
            <button id="btnNodeBoxDelete" type="button" class="btn btn-danger">Supprimer</button>        
            <button id="btnNodeBoxSave" type="button" class="btn btn-success">Enregistrer</button>        
        </div>
    </div>
    </div>
`;
