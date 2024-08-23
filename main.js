import {modal} from './modules/modal.js';
import {auth} from './modules/auth.js';
import {tagcloud} from './modules/tagcloud.js';
import {loader} from './modules/loader.js';
import {tree} from './modules/tree.js';
import {transcription} from './modules/transcription.js';

        let tc, 
            hotRes, 
            //accordion = document.getElementById('accordionJDC'),
            //rectAccordion = accordion.getBoundingClientRect(),
            wait = new loader(),
            cherche;
            

        //dimensionne les contenus
        let rectFooter = d3.select('footer').node().getBoundingClientRect(),
        rectHeader = d3.select('header').node().getBoundingClientRect(),
        hMap = rectFooter.top-rectFooter.height-rectHeader.bottom;
        d3.select('#contentMap').style('height',hMap+"px");
        d3.select('#contentResources').style('height',hMap+"px");
        let  rectMap = d3.select('#contentMap').node().getBoundingClientRect(),
            wMap = rectMap.width;
        //initialisation des connexions
        let a = new auth({'navbar':d3.select('#navbarConnect'),
                mail:'samuel.szoniecky@univ-paris8.fr',
                apiOmk:'../omk_deleuze/api/',
                ident: 'lBBNzw1HsXS4UhOwur0xE3nvNgOWapNv',
                key: 'NUHcMUVsolp4PSFfZYGGh5Z01eLClbML'
            });
        //log l'utilisateur
        a.getUser(u=>{
            console.log(u);
            a.omk.searchItems('resource_class_id=47',
                data=>{
                    //listSeminar.slice(0, {'o:title':'All','o:id':0});
                    setMenu('#ddSeminar', data,'o:title',showSeminar);
                    wait.hide();
                },false
            );
        });
        //gestion des event de l'ihm
        
        /*
        accordion.addEventListener('shown.bs.collapse', event => {
            if(event.target.id=="collapseThree"){
                hotCpx = setTable(dataDetails.csv,d3.select('#contentDetails'),hotCpx);
            }
            if(event.target.id=="collapseFour"){
                hotRes = setTable(dataDetails.infos.resources,d3.select('#contentResources'), hotRes);
            }
        })
        */

        d3.select("#btnSearchAll").on('click',e=>{
            cherche = document.getElementById('inptSearchAll').value;
            if(cherche){
                wait.show();
                let url = a.omk.api.replace('api/','')
                +"s/cours-bnf/page/ajax?json=1&helper=sql&action=timelineConcept&searchCpt="+cherche;                               
                d3.json(url).then(function(rs) {
                    formatDataCherche(rs);
                });
            }
        })        

        function formatDataCherche(rs){
            if(!rs.length){                
                wait.hide();
                let m=new modal({'size':'modal-sm','class':' text-bg-secondary',
                    'titre':'Aucun élément<i class="fa-solid fa-empty-set"></i><i class="fa-light fa-face-pensive"></i>',
                    'body':'<div>Merci de faire une nouvelle recherche !</div><div class="my-2"><i class="fa-sharp fa-light fa-face-relieved fa-2xl"></i></div>'
                });
                m.show();
                return
            }
            tc=new tagcloud({
                'cont':d3.select('#contentMap'),'user':a.omk.user,'data':rs,
                'w':wMap, 'h':hMap, 'omk':a.omk,
                'contParams':d3.select('#contentParams'),  
                fct:{'clickTag':showFrags,'drawEnd':showAllFrags}
            })     
            //showFrags(null,data)
            wait.hide();
        }

        function showSeminar(e,d){
            wait.show();
            let url = a.omk.api.replace('api/','')
                //+"s/cours-bnf/page/ajax?json=1&helper=sql&action=statConcept&id="+d['o:id'];
                +"s/cours-bnf/page/ajax?json=1&helper=sql&action=timelineConcept&idConf="+d['o:id'];                               
            d3.json(url).then(function(rs) {
                console.log('data seminaire : OK');
                tc=new tagcloud({
                    'cont':d3.select('#contentMap'),'user':a.omk.user,'data':rs,
                    'w':wMap, 'h':hMap, 'omk':a.omk,
                    'contParams':d3.select('#contentParams'),  
                    fct:{'clickTag':showFrags,'drawEnd':showAllFrags}
                }) 
            });                            
        }
        function filtreFrags(d,slt){
        }

        function showAllFrags(slt){
            showFrags(false,slt);
        }

        function showFrags(d,slt){
            console.log(d);
            let t = new transcription({
                'a':a,
                'cont':d3.select("#contentResources"),
                'contParams':d3.select('#contentResourcesParams'),  
                'vals':d3.merge(slt.data().map(s=>s.vals)),
                'selectConcepts': d ? [d.key] : cherche.split(' ')
            });
        }
               

        async function getListeFragments(id){
            return await a.omk.getAllItems('sort_order=id&property[0][joiner]=and&property[0][property]=451&property[0][type]=res&property[0][text]='+id);
        }

        function showTagTools(e,d){
            console.log(d);
        }

        function getDataWords(d){
            return d.trans['o:title'].split(' ').map(t=>{
                return {'data':d,'t':t,'select':t==d[1][0].titleCpt}
            });
        }

        