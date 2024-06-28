export class modal {
    constructor(params={}) {
        var me = this;
        this.id = params.id ? params.id : "UserModal";
        this.titre = params.titre ? params.titre : "Message";
        this.body = params.body ? params.body : "";
        this.boutons = params.boutons ? params.boutons : [{'name':"Close"}];
        this.size = params.size ? params.size : '';
        var m, mBody, mFooter;
        this.init = function () {
            //ajoute la modal pour les messages
            let html = `
                <div class="modal-dialog ${me.size}">
                <div class="modal-content">
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
//ajoute la modal pour changer le concept d'un crible
export let modalChangeConcept = `
    <div class="modal-dialog ">
    <div class="modal-content">
        <div class="modal-header text-bg-warning">
        <h5 id="choixConceptTitre" class="modal-title">Changer le concept :</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body text-bg-dark">                            
            <div class="input-group mb-3">
                <label for="choixConcept" class="form-label px-2">Choisir un concept : </label>
                <div id="choixConcept" class="form-control">
                    <input class="typeahead" type="text" placeholder="Saisir le nom du concept">
                </div>                
            </div>            
        </div>                          
        <div class="modal-footer text-bg-warning">
        </div>
    </div>
    </div>
`;
//ajoute la modal pour ajouter un crible
export let modalAddCrible = `
    <div class="modal-dialog modal-lg">
    <div class="modal-content">
        <div class="modal-header text-bg-danger">
        <h5 id="choixCribleTitre" class="modal-title">Changer le concept :</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body text-bg-dark">                            
            <div class="input-group mb-3">
                <label for="choixCrible" class="form-label px-2">Choisir un concept : </label>
                <div id="choixCrible" class="form-control">
                    <input class="typeahead" type="text" placeholder="Saisir le nom du concept">
                </div>                
            </div>
            <div class="input-group">
                <label for="treeselect" class="form-label">Choisir la relation : </label>
            </div>                          
            <div id="treeselect"></div>                        
        <div class="modal-footer text-bg-danger">
        </div>
    </div>
    </div>
`;

//ajoute la modal pour afficher les infos node stream
export let modalStreamNode = `
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header text-bg-warning">
                <h5 id="streamNodeTitre" class="modal-title">Changer le concept :</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body text-bg-dark">                            


                <ul class="nav nav-tabs" id="streamNodeTab" role="tablist">
                </ul>
                <div class="tab-content" id="streamNodeTabContent">
                </div>            


            </div>
            <div class="modal-footer text-bg-warning">
            </div>
        </div>
    </div>
`;

//ajoute la modal pour paramétrer le stream
export let modalStreamParams = `
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header text-bg-warning">
                <h5 class="modal-title">Stream Words Parameters</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body text-bg-dark">                            
                <div class="row">
                    <div class="col-2">
                        <label class="form-label">Heigth = </label>
                        <label id="value-H" class="form-label"></label>
                    </div>
                    <div class="col-10">
                        <div id="slider-H"></div>
                    </div>
                </div>                                        
            </div>
            <div class="modal-footer text-bg-warning">
            </div>
        </div>
    </div>
`;