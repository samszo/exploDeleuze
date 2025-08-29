import {modal} from './modules/modal.js';
import {auth} from './modules/auth.js';
import {tagcloud} from './modules/tagcloud.js';
import {loader} from './modules/loader.js';
import {tree} from './modules/tree.js';
import {transcription} from './modules/transcription.js';
import {anythingLLM} from './modules/anythingLLM.js';
import {appUrl} from './modules/appUrl.js';
import {pa} from './modules/authParams.js';

        let tc, conferences, cours,
            hotRes, 
            //accordion = document.getElementById('accordionJDC'),
            //rectAccordion = accordion.getBoundingClientRect(),
            wait = new loader(),
            cherche, curData, curConf,
            aUrl = new appUrl({'url':new URL(document.location)});
            

        //dimensionne les contenus
        let rectFooter = d3.select('footer').node().getBoundingClientRect(),
        rectHeader = d3.select('header').node().getBoundingClientRect(),
        hMap = rectFooter.top-rectFooter.height-rectHeader.bottom;
        d3.select('#contentMap')
            .style('height',hMap+"px")
            .style('overflow-y','scroll');
        d3.select('#contentResources').style('height',hMap+"px");
        let  rectMap = d3.select('#contentMap').node().getBoundingClientRect(),
            wMap = rectMap.width,
            aLLM,
            //initialisation des connexions
            a = new auth(pa);
        //log l'utilisateur
        a.getUser(u=>{
            console.log(u);
            if(aUrl.params.has('idTrans'))showTranscription(aUrl.params.get('idTrans'));
            if(aUrl.params.has('idConf'))showSeminar(null,null,aUrl.params.get('idConf'));
            if(aUrl.params.has('idNote'))showNote(aUrl.params.get('idNote'));
            
            /*on remplace par un arbre des cours
            a.omk.getAllItems('resource_class_id=47',
                data=>{
                    //listSeminar.slice(0, {'o:title':'All','o:id':0});
                    setMenu('#ddSeminar', data,'o:title',showSeminar);
                    setSheetCours(data);
                    wait.hide();
                },false
            );
            */
            let url = a.omk.api.replace('api/','')
                +"s/cours-bnf/page/ajax?json=1&helper=sql&action=getConferences";
            //optimisation            
            url = "assets/data/getConferences.json";
            wait.show();
            d3.json(url).then(data=>{
                cours = data;               
                //on regroupe par theme et promo
                conferences = Array.from(d3.group(cours,d=>d.promo+' : '+d.theme)); 
                console.log(conferences);
                showConferences();
                wait.hide();
            })
            aLLM = new anythingLLM({
                //stocké dans les settings de authParams.js
                'a':a,
                'omk':a.omk,
                'cont':d3.select('#contentMap'),
                'contParams':d3.select('#contentParams'),
                'fct':{'showThread':changeButtonColor}
            })
        });
        //gestion des event de l'ihm
        d3.select("#btnShowListConf").on('click',e=>{
            changeButtonColor(e.currentTarget.id);
            showConferences();
        })
        d3.select("#btnSearchAll").on('click',e=>{
            cherche = document.getElementById('inptSearchAll').value;
            if(cherche){
                wait.show();
                changeButtonColor(e.currentTarget.id)
                let url = a.omk.api.replace('api/','')
                +"s/cours-bnf/page/ajax?json=1&helper=sql&action=timelineConceptAnnexe&cherche="+cherche;                               
                d3.json(url).then(function(rs) {
                    formatDataCherche(rs);
                });
            }
        })        

        function showTranscription(idTrans){
            wait.show();
            let url = a.omk.api.replace('api/','')
                    +"s/cours-bnf/page/ajax?json=1&helper=sql&action=timelineConceptAnnexe&idTrans="+idTrans;                               
            d3.json(url).then(function(rs) {
                let t = new transcription({
                    'a':a,
                    'cont':d3.select("#contentResources"),
                    'contParams':d3.select('#contentResourcesParams'),  
                    'vals':rs,
                    'selectConcepts': []
                })
                wait.hide();
            });

        }

        function showNote(idNote){
            wait.show();
            let url = a.omk.api.replace('api/','')
                    +"s/cours-bnf/page/ajax?json=1&helper=sql&action=getTransNote&idNote="+idNote;                               
            d3.json(url).then(function(rs) {
                let t = new transcription({
                    'a':a,
                    'cont':d3.select("#contentResources"),
                    'contParams':d3.select('#contentResourcesParams'),  
                    'vals':rs.trans,
                    'selectConcepts': [],
                    'note':rs.note,
                    'events':{'endDraw':'gotoNote'}
                });
                wait.hide();
            });

        }
        

        function changeButtonColor(id){
            //change la couleur des boutons
            ['btnSearchAll','btnShowListConf','btnShowAnythingLLM'].forEach(b=>{
                d3.select('#'+b).attr('class',b==id ? 
                    'btn btn-outline-success me-2' : 'btn btn-outline-danger me-2');
            });
        }

        function showConferences(){            
            d3.select('#contentMap').select('*').remove();
            d3.select('#contentParams').select('*').remove();
            let acc = d3.select('#contentMap').append('div')
                .attr('id','accConferences')
                .attr('class',"accordion"),
            confs = acc.selectAll('div').data(conferences).enter()
                .append('div').attr('class',"accordion-item");
            confs.append('h2').attr('class',"accordion-header")
                .append('button').attr('class',"accordion-button")
                    .attr('type',"button")
                    .attr('data-bs-toggle',"collapse")
                    .attr('data-bs-target',(d,i)=>"#theme"+i)
                    .attr('aria-expanded',"false")
                    .attr('aria-controls',(d,i)=>"theme"+i)
                    .text(d=>d[0]+' : '+d[1].length+' séances');
            let confBody =  confs.append('div').attr('class',"accordion-collapse collapse")
                .attr('id',(d,i)=>"theme"+i)
                .attr('data-bs-parent',"#accConferences")
                .append('div').attr('class',"accordion-body p-1");
            let ul = confBody.append('ul').attr('class',"list-group"),
            li = ul.selectAll('li').data(d=>d[1].sort((a, b)=> a.num - b.num)).enter()
                .append('li').attr('class',getListConfClass).on("click",selectConf),
            div = li.append('div').attr('class','d-flex w-100 justify-content-between');
            div.append('div').html(t=>{
                return 'Cours '+t.num+' = '
                    +new Date(t.nbFrag * 50 * 1000).toISOString().slice(11, 19)
                    +' = '+t.nbConcept+' concepts';
            });
            div.append('h5').attr('class','mb-1')
                .text(t=>t.created);
            /*
            li.append('p').attr('class',"mb-1 text-start")
                .html(t=>t.nbConcept+' '+t.nbFrag);
            */
            let docs = li.append('div').attr('class',"btn-group")
                .attr('role',"group").attr('aria-label',"Documents liés");
            /*
            docs.selectAll('button').data(t=>JSON.parse(t.sujets)).enter()
                .append('button').attr('type',"button").attr('class',"btn btn-outline-danger btn-sm")
                .text(d=>d.label)
                .on('click',showSujets)
            */         
            docs.append('div').attr('class','d-flex flex-wrap')
                .selectAll('span').data(t=>{
                        return t.sujets ? JSON.parse(t.sujets):[]
                    }).enter()
                    .append('span').attr('class',"badge text-white bg-dark rounded m-1")
                    .text(d=>d.label)
                    .on('click',showSujets)         
        }

        function getListConfClass(d,i,v='visible'){
            let c = "list-group-item p-1 ";
            c += i%2 == 0 ? "list-group-item-light "+v : "list-group-item-dark "+v;
            return c;
        }

        function selectConf(e,d){
            let tgt = d3.select(e.currentTarget)
            if(tgt.attr('class')=='list-group-item list-group-item-success'){
                tgt.attr('class','list-group-item');
                d3.select('#contentMap').select('*').remove();
            }else{
                tgt.attr('class','list-group-item list-group-item-success');
                showSeminar(e,d);
            }
        }

        function showSujets(e,d){
            console.log(d);
        }

        function formatDataCherche(rs){
            if(!rs.timeline.length){                
                wait.hide();
                let m=new modal({'size':'modal-sm','class':' text-bg-secondary',
                    'titre':'Aucun élément<i class="fa-solid fa-empty-set"></i><i class="fa-light fa-face-pensive"></i>',
                    'body':'<div>Merci de faire une nouvelle recherche !</div><div class="my-2"><i class="fa-sharp fa-light fa-face-relieved fa-2xl"></i></div>'
                });
                m.show();
                return
            }
            curData=rs;
            tc=new tagcloud({
                'cont':d3.select('#tagcloudContent'),'user':a.omk.user,'data':curData.timeline,
                'w':wMap, 'h':hMap, 'omk':a.omk,
                'contParams':d3.select('#tagcloudParams'),  
                fct:{'clickTag':showFrags,'drawEnd':showAllFrags}
            })     
            //showFrags(null,data)
            wait.hide();
        }

        function showSeminar(e,d,id){
            wait.show();
            let url = a.omk.api.replace('api/','')
                //+"s/cours-bnf/page/ajax?json=1&helper=sql&action=statConcept&id="+d['o:id'];
                //+"s/cours-bnf/page/ajax?json=1&helper=sql&action=timelineConcept&idConf="+d['o:id'];                               
                +"s/cours-bnf/page/ajax?json=1&helper=sql&action=timelineConceptAnnexe&idConf="
                +(d ? d.id : id);                               
            d3.json(url).then(function(rs) {
                console.log('data seminaire : OK');
                curData=rs;
                curConf=d;
                tc=new tagcloud({
                    'cont':d3.select('#tagcloudContent'),'user':a.omk.user,'data':curData,
                    'w':wMap, 'h':hMap, 'omk':a.omk,
                    'contParams':d3.select('#tagcloudParams'),  
                    fct:{'clickTag':showFrags,'drawEnd':showAllFrags}
                }) 
            });                            
        }
        function filtreConf(idsConf){
            if(idsConf.length==cours.length)return;
            console.log(idsConf);
            d3.select('#accConferences').selectAll('.list-group-item.p-1')
                .attr('class',(d,i)=>(d,i,idsConf.includes(d.id) ? "visible" : "invisible"))
                .style('display',d=>idsConf.includes(d.id) ? "block" : "none")
        }

        function showAllFrags(slt,data){
            //uniquement les mots du tagcloud
            //showFrags(false,slt);
            //tous les mots
            showFrags(false,slt,curData.timeline ? curData.timeline : curData);
        }

        function showFrags(d,slt,data){
            console.log(d);
            //filtre les datas
            if(!data){
                let dataFiltre = curData.timeline ? curData.timeline : curData,
                    idsFrag = Array.from(d3.group(d3.merge(slt.data().map(s=>s.vals)),d=>d.idFrag).keys());
                data = dataFiltre.filter(cd=>idsFrag.includes(cd.idFrag));
            } 
            //filtre les conf
            filtreConf(Array.from(d3.group(data,d=>d.idConf).keys()));

            let t = new transcription({
                'a':a,
                'cont':d3.select("#contentResources"),
                'contParams':d3.select('#contentResourcesParams'),  
                'vals':data,
                'selectConcepts': d ? [d.key] : 
                    cherche ? cherche.split(' ') : []
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

        function setSheetCours(data){
            let dataSheet = data.map(d=>{
                return {'choix':true,'date':d["dcterms:date"][0]["@value"],'titre':d["o:title"]}
            })
            let headers = Object.keys(dataSheet[0]);
            let hotCours = new Handsontable(d3.select('#sheetCours').node(), {
                className: 'htDark',
                afterGetColHeader: function(col, TH){
                    TH.className = 'darkTH'
                },
                colHeaders: true,
                rowHeaders: true,
                data:dataSheet,
                colHeaders: headers,
                height: 600,
                width: 800,
                colWidths: [60, 104, 400],
                stretchH: 'last',
                licenseKey: 'non-commercial-and-evaluation',
                customBorders: true,
                dropdownMenu: true,
                multiColumnSorting: true,
                filters: true,
                columns: getCellEditor(headers),
                allowInsertColumn: false,
                copyPaste: false,
                search: true,                        
            });            
        }
        