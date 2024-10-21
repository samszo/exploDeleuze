import {slider} from './slider.js';
import {modal} from './modal.js';
import {bnf} from './bnf.js';
import {loader} from './loader.js';

export class transcription {
    constructor(config={}) {
        var me = this;
        this.cont = config.cont ? config.cont : d3.select('body'); 
        this.contParams = config.contParams ? config.contParams : false;
        this.toolbar = config.toolbar ? config.toolbar : false;
        this.vals = config.vals ? config.vals : [];  
        this.selectConcepts = config.selectConcepts ? config.selectConcepts : [];  
        this.a = config.a ? config.a : [];  
        this.loader = new loader();
        let rectContRess, 
            heightLine = 200, nbLine = 3, lineBand, 
            pixelParMilliseconde = 0.5,
            colorBox = '#ffc00870',
            selectConceptsPosis=[], 
            mNote, noteBox=[], 
            mRef=new modal({'size':'modal-lg'}).add('modalAddRef'),
            //en milliseconde
            margeBox = 100,
            oBnf = new bnf(), hotResult, hotResultHeight=400,
            typeRef = ['jdc:hasPerson','jdc:hasGeo','jdc:hasEpoque','jdc:hasBook','jdc:hasMovie','jdc:hasMusic','jdc:hasLink','jdc:hasConcept'],
            continuousPlaying;

        this.init = function () {
            //initialisation des contenus
            me.cont.selectAll('*').remove();
            rectContRess = me.cont.node().getBoundingClientRect();
            selectConceptsPosis=[];
            let m=new modal({'size':'modal-lg'}),
                arrNoteButtons = [                    
                    {'id':'btnNodeBoxClose','fct':e=>mNote.m.hide()},
                    {'id':'btnNodeBoxDelete','fct':deleteNoteBox},
                    {'id':'btnNodeBoxSave','fct':saveNoteBox},
                    {'id':'btnAddPerson','fct':addNoteBoxRef},
                    {'id':'btnAddGeo','fct':addNoteBoxRef},                    
                    {'id':'btnAddEpoque','fct':addNoteBoxRef},                    
                    {'id':'btnAddBook','fct':addNoteBoxRef},
                    {'id':'btnAddMovie','fct':addNoteBoxRef},
                    {'id':'btnAddMusic','fct':addNoteBoxRef},
                    {'id':'btnAddLink','fct':addNoteBoxRef},
                    {'id':'btnAddConcept','fct':addNoteBoxRef},
                ];             
            mNote = m.add('modalNodeBox');
            arrNoteButtons.forEach(b=>mNote.s.select('#'+b.id).on('click',b.fct));

            //regroupe les valeurs par conférence et par track
            me.vals.sort((a,b)=>{
                let av = a.idConf+'_'+a.face+'_'+a.plage+'_'+Number.parseFloat(a.startFrag),
                bv = b.idConf+'_'+b.face+'_'+b.plage+'_'+Number.parseFloat(b.startFrag);
                return av-bv;
            })
            let hFrags = d3.hierarchy(d3.group(me.vals, 
                    d => d.idConf, 
                    d => 'Face '+d.face+' - plage '+d.plage, 
                    d => d.idFrag, 
                    //d => d.creator, d => d.startCpt+'->'+d.endCpt
                    )),
            labels = hFrags.descendants().map(d => {
                d.typeNode = d.depth > 2 ? 'div' : 'H'+(3+d.depth);
                let dt = d.leaves()[0].data;
                switch (d.depth) {
                    case 0:
                        d.label = 'Cours';
                        d.class = 'cour_';
                        d.id = 'Cours';
                        break;       
                    case 1:
                        d.label = dt.titleConf+' - cours '+dt.num+' : '+dt.created;
                        d.id = dt.idConf;
                        d.class = 'conf_';
                        d.type = "o:Item";
                        d.bnf = true;
                        //trop gourmand d.omk = me.a.omk.getItem(dt.idConf);
                        d.source = dt['source'+d.depth];
                        break;       
                    case 2:
                        d.label = d.data[0];
                        d.class = 'mediaConf_';
                        d.id = dt.idMediaConf;
                        d.type = "o:Media";
                        d.bnf = true;
                        //trop gourmand d.omk = me.a.omk.getMedia(dt.idMediaConf);
                        d.source = dt['source'+d.depth];
                        break;       
                    case 3:
                        d.label = 'Fragment '
                            +d3.timeFormat("%M:%S")(Number.parseFloat(dt.startFrag)*1000)
                            +' -> '
                            +d3.timeFormat("%M:%S")(Number.parseFloat(dt.endFrag)*1000);
                        d.source = dt['source'+d.depth];
                        d.id = d.data[0];
                        d.class = 'frag_';
                        d.type = "o:Media";
                        break;       
                    case 4:
                        d.label = d.data[0];
                        d.id = dt.idTrans;
                        d.class = 'trans_';
                        d.type = "o:Media";
                        //trop gourmand d.omk = me.a.omk.getItem(dt.idTrans);
                        d.source = dt['source'+d.depth];
                        break;       
                    case 6:
                        d.label = d.data.titleCpt;
                        break;                
                    default:
                        d.label = d.data[0];
                        break;                
                }
                return {'label':d.label,'typeNode':d.typeNode};
            }),
            //calcule les cours dans l'ordre hiérarchique
            cours = [];
            hFrags.eachBefore(d => cours.push(d));
            //création de l'arbre des résultats
            let sltHierarchies = me.cont.selectAll('div').data(cours).enter()
                .append(d=>document.createElement(d.typeNode))
                    .attr('class',d=>'depth'+d.depth)
                    .attr('id',d=>d.class+d.id)
                    .html(d=>d.label);
            //ajoute les compléments de l'arbre
            me.cont.selectAll('.depth1,.depth2,.depth3').call(addLinkReference);
            me.cont.selectAll('.depth3').call(addFragment);
            //suprime les dimensions inutiles
            me.cont.selectAll('.depth4').remove();
            //ajoute la barre des paramètres
            if(me.contParams)showParams();   
            
            me.loader.hide(true);
        }

        function addLinkReference(e){
            e.append('a').attr('href',d=>{
                    return d.source;//d.omk["dcterms:source"] ? d.omk["dcterms:source"][0]["@id"] : '';
                }).attr('target',"_blank")
                .style('display', d=> d.bnf ? "inline" : "none")
                .append('img').attr('src','assets/img/Logo_BnFblanc.svg')
                    .attr('class','mx-2')
                    .style("height","20px");
            e.append('a').attr('href',d=>{
                    return me.a.omk.getAdminLink(null,d.id,d.type)
                }).attr('target',"_blank")
                .append('img').attr('src','assets/img/OmekaS.png')
                    .attr('class','mx-2')
                    .style("height","20px");
        }

        function addFragment(e){
            //création des viewer media
            let toolBar = e.append('div').attr('class',"btn-toolbar my-2 justify-content-center").attr('role',"toolbar").attr('aria-label',"Gestion des médias");
            toolBar.append('button').attr('type',"button").attr('class',"btn btn-danger btn-sm").html('<i class="fa-solid fa-backward-fast"></i>')
                    .on('click',showFirstFragment);
            toolBar.append('button').attr('type',"button").attr('class',"btn btn-danger btn-sm").html('<i class="fa-solid fa-backward-step"></i>')
                    .on('click',showPrevFragment);
            toolBar.append('audio').attr('id',v=>'audio'+v.id)
                .attr('src',v=>{
                    return me.a.omk.getMediaLink(v.source);//v.omk["o:original_url"];
                })
                .attr("class","mx-2").attr("controls",true)
                .style("height", "24px")
                .on("play",audioPlay)
                .on("timeupdate",audioProgress)
                .on("ended",audioEnd);
            toolBar.append('button').attr('type',"button").attr('class',"btn btn-danger btn-sm").html('<i class="fa-solid fa-forward-step"></i>')
                    .on('click',showNextFragment);
            toolBar.append('button').attr('type',"button").attr('class',"btn btn-danger btn-sm").html('<i class="fa-solid fa-forward-fast"></i>')
                    .on('click',showLastFragment);
            toolBar.append('button').attr('type',"button").attr('class',"btn btn-danger btn-sm ms-2").html('<i class="fa-solid fa-notes-medical"></i>')
                    .on('click',addLinkTime);
                    
            //ajoute le tableau des transcriptions
            e.append('div').attr('class',"container text-center")
                    .call(addTranscription);
                                   
        }
        
        function addLinkTime(e,d){
            let curTime = me.cont.select('#audio'+d.id).node().currentTime*1000;
            me.cont.select('#'+d.class+d.id).selectAll('svg').call(s=>addNoteBox(s,curTime));
        }
        function addNoteBoxSave(svg,d){
            svg.data().forEach(d=>getNoteForTrans(d));    
        }       
        function getNoteForTrans(t){
            /*trop gourmand
            on charge le détail au click sur la note
            let q = "property[0][joiner]=and&property[0][property][]="+me.a.omk.getPropId("oa:hasSource")
                +"&property[0][type]=res&property[0][text]="+t.idTrans
                +"&resource_template_id[]="+me.a.omk.getRtId("Note transcription")
            return me.a.omk.getAllItems(q);
            */
            let q = "cours-bnf/page/ajax?json=1&helper=sql&action=getTransNote&id="+t.idTrans;
            me.a.omk.getSiteViewRequest(q,rs=>{
                rs.forEach(r=>r.trans=t);
                d3.select('#trans'+t.idTrans).selectAll('.noteBoxSave').data(rs)
                    .enter().append('g').attr('id',nb=>{
                        nb.start = Number.parseFloat(nb.start);
                        nb.end = Number.parseFloat(nb.end);
                        return 'note'+nb.id;
                    })
                    .attr('class','noteBoxSave')
                    .call(createNoteBox);    
            });
        } 
        function addNoteBox(svg,t){
            svg.selectAll(".noteBoxAdd")
            .data(d=>{
                let db={'omk':false,'id':'trans'+d.idTrans+'_box'+noteBox.length,
                    'trans':d
                };
                noteBox.push(db);
                return noteBox.filter(nb=>nb.trans.idTrans==d.idTrans)
            })
            .join(
              enter => {
                enter.append('g').attr('id',d=>{
                    d.start=d.trans.start+t;
                    d.end=d.trans.start+t+margeBox;
                    return d.id
                })
                .attr('class','noteBoxAdd')
                .call(createNoteBox);
              }
            )
        }
        function createNoteBox(boxes){
            //ajouter une boxe
            boxes.append('rect')
                .attr('id',nb=>{
                    return 'noteRect'+nb.id
                })
                .attr('x',nb=>{
                    nb.x = nb.trans.scaleTime(nb.start);
                    return nb.x;                    
                })
                .attr('y',0)
                .attr('height',heightLine-20)
                .attr('width',nb=>{
                    nb.width = nb.trans.scaleTime(nb.end)-nb.trans.scaleTime(nb.start);
                    return nb.width;
                })
                .attr('fill',nb=>{
                    nb.color = nb.color ? nb.color : colorBox;
                    return nb.color;
                })
                .style('cursor','zoom-in')                
                .on('click',showNoteBox);
            //ajoute les boutons de déplacement
            boxes.append('rect')
                .attr('id',nb=>'noteMoveRect'+nb.id)
                .attr('x',nb=>nb.x)
                .attr('y',heightLine-20)
                .attr('height',20)
                .attr('width',nb=>nb.width)
                .attr('fill',"white")
                .style('cursor','col-resize')                
                .on('click',addBrush);    
            boxes.append('image')
                .attr('id',nb=>'noteArrowLeft'+nb.id)
                .attr('x',nb=>nb.x)
                .attr('y',heightLine-20)
                .attr('height',20)
                .attr('width',20)
                .attr('xlink:href',"assets/img/left-arrow.svg")
                .style('cursor','col-resize')                
                .on('click',addBrush);    
            boxes.append('image')
                .attr('id',nb=>'noteArrowRight'+nb.id)
                .attr('x',nb=>nb.x+nb.width-20)
                .attr('y',heightLine-20)
                .attr('height',20)
                .attr('width',20)
                .attr('xlink:href',"assets/img/right-arrow.svg")
                .style('cursor','col-resize')                
                .on('click',addBrush);
        }
        function showNoteBox(e,note){
            e.stopImmediatePropagation();
            me.loader.show();
            //récupère la note complète si ce n'est déjà fait
            if(!note.omk){
                note.omk=me.a.omk.getItem(note.id);
                me.a.omk.loader.hide(true);
            }
            mNote.m.show();
            mNote.s.select('#inptNoteDeb').node().value = d3.timeFormat("%M:%S.%L")(note.start);
            mNote.s.select('#inptNoteDebVal').node().value = note.start;
            mNote.s.select('#inptNoteFin').node().value = d3.timeFormat("%M:%S.%L")(note.end);
            mNote.s.select('#inptNoteFinVal').node().value = note.end;
            mNote.s.select('#inptNoteColor').node().value = d3.color(note.color).formatHex();                
            mNote.s.select('#inptIdNote').node().value = note.omk ? note.omk['o:id'] : "";
            //on met à jour le titre à chaque fois
            mNote.s.select('#inptTitreNote').node().value = 
                'Note '+note.trans.idFrag
                    +'-'+note.trans.idTrans           
                    +' : '+d3.timeFormat("%M:%S.%L")(note.start)+' -> '+d3.timeFormat("%M:%S.%L")(note.end);            
            //pareil pour la description qui correspond au texte de la sélection
            mNote.s.select('#inptDescNote').node().value = getNoteDesc(note);
            mNote.s.select('#inptConceptNote').node().value = getNoteConcept(note);            
            mNote.s.select('#inptIdFrag').node().value = note.trans.idFrag;
            mNote.s.select('#inptIdTrans').node().value = note.trans.idTrans;
            //on affiche les références
            showRefs(note);
            me.loader.hide();
        }
        function showRefs(note){            
            mNote.s.selectAll('.list-group').selectAll('li').remove()
            if(!note.omk)return;
            typeRef.forEach(r=>{
                if(note.omk[r]){
                    let ids = note.omk[r].map(n=>n.value_resource_id);
                    me.a.omk.searchItems("id="+ids.join(','),items=>showNoteBoxRef(items));
                }
            })
        }

        function getNoteDesc(note){
            let desc = note.trans[1].filter(n=>n.x1>=note.x && n.x1<=(note.x+note.width)).map(n=>n.titleCpt);
            return desc.join(" ");
        }
        function getNoteConcept(note){
            return note.trans[1].filter(n=>n.x1>=note.x && n.x1<=(note.x+note.width)).map(n=>n.idCpt).join(",");
        }

        function saveNoteBox(e,d){
            //récupère les données
            me.loader.show();
            let start = mNote.s.select('#inptNoteDebVal').node().value,
                end = mNote.s.select('#inptNoteFinVal').node().value,
                titre = mNote.s.select('#inptTitreNote').node().value,
                desc = mNote.s.select('#inptDescNote').node().value,
                idFrag = mNote.s.select('#inptIdFrag').node().value,
                idTrans = mNote.s.select('#inptIdTrans').node().value,
                idNote = mNote.s.select('#inptIdNote').node().value, 
                color = d3.color(mNote.s.select('#inptNoteColor').node().value)
                        .copy({opacity: 0.32}).formatHex8(),
                data = {
                    'o:resource_template':'Note transcription',
                    "dcterms:title":titre, 
                    "dcterms:description":desc,
                    "dcterms:isReferencedBy":idFrag+":"+idTrans+":"+start+":"+end,
                    "ma:hasFragment":{'rid':idFrag},
                    "oa:hasSource":{'rid':idTrans},
                    "oa:start":start,
                    "oa:end":end,
                    'jdc:degradColors':color
                };
            //récupère les concepts liés
            let cpts = mNote.s.select('#inptConceptNote').node().value            
            //récupère les références
            mNote.s.selectAll(".list-group").selectAll('li').data().forEach(r=>{
                console.log(r);
                let type = getRefType(r);
                if(!data['jdc:has'+type])data['jdc:has'+type]=[];
                data['jdc:has'+type].push({'rid':r['o:id']});
            });
            if(idNote){                
                //mise à jour dans omk
                me.a.omk.updateRessource(idNote, data,'items',null,"PATCH",i=>{
                    console.log(i);
                    redrawTranscription();
                    mNote.hide();
                    me.loader.hide();
                });
            }else{
                //enregistre dans omk
                me.a.omk.createItem(data,i=>{
                    console.log(i);
                    redrawTranscription();
                    mNote.hide();
                    me.loader.hide();
                });
            }
        }

        async function getOmkRef(rs){
            let arr=[];
            for (let index = 0; index < rs.length; index++) {
                const r = rs[index];
                //on recherche la ref par rapport au titre
                let rt = me.a.omk.getRt('ref '+r[7]),
                query = "property[0][joiner]=and&property[0][property]=1"
                    +"&property[0][type]=eq&property[0][text]="+r[1]
                    +"&resource_class_id[]="+rt["o:resource_class"]["o:id"]
                    +"&resource_template_id[]="+rt["o:id"],
                itemsFind = me.a.omk.searchItems(query); 
                if(!itemsFind.length){
                    //enregistre dans omk
                    let data = {
                        'o:resource_template':'ref '+r[7],
                        'o:resource_class':'foaf:Person',
                        "dcterms:title":r[1], 
                        "dcterms:isReferencedBy":{'u':r[4],'l':r[8]},
                        "bio:birth":r[2],
                        "bio:death":r[3],
                        "foaf:familyName":r[6],
                        "foaf:givenName":r[5]
                    }    
                    let i = await me.a.omk.createItem(data);
                    arr.push(i); 
                }else{
                    //vérifie l'url de référence
                    let uriRefs = itemsFind[0]["dcterms:isReferencedBy"].filter(ir=>ir["@id"]==r[4]);
                    if(uriRefs.length==0){
                        me.a.omk.updateRessource(itemsFind[0]['o:id'], {"dcterms:isReferencedBy":{'u':r[4],'l':r[8]}}
                            ,'items',null,'PUT',false,itemsFind[0]);
                    }
                    arr.push(itemsFind[0]);   
                }  
            }
            return arr;
        }

        function deleteNoteBox(e,d){
            console.log(d);
        }

        function setNoteBoxRef(e,d){
            getOmkRef(hotResult.getData().filter(r=>r[0])).then(refs=>{
                showNoteBoxRef(refs);
                mRef.m.hide();
                mNote.m.show();    
            })        
        }
        function getRefType(d){
            return me.a.omk.getRtById(d["o:resource_template"]["o:id"])['o:label'].substring(4);                        
        }
        function showNoteBoxRef(refs){
            let type = getRefType(refs[0]),
                liste = mNote.s.select('#lstNodeBox'+type).selectAll('li').data(refs).enter()
                    .append('li').attr('class',"list-group-item list-group-item-warning d-flex justify-content-between align-items-start"),
                listeBody = liste.append('div').attr('class',"ms-2 me-auto"),
                listeBtn = liste.append('div').attr('class',"d-flex flex-row-reverse align-items-center");
            
            listeBody.append('div').attr('class',"fw-bold")                    
                .text(d=>{
                    return d["o:title"];
                });
            listeBody.append('p').attr('class','mt-0').html(d=>{
                    return `<i class="fa-solid fa-cake-candles"></i> ${d["bio:birth"][0]["@value"]}
                        <i class="fa-solid fa-skull"></i> ${d["bio:death"][0]["@value"]}`;
                });
            listeBtn.append('button').attr('class',"btn btn-danger badge rounded-pill")
                .html('<i class="fa-solid fa-recycle"></i>')
                .on('click',extrapolerNote);
            listeBtn.append('button').attr('class',"btn btn-danger badge rounded-pill")
                .html('<i class="fa-solid fa-trash-can"></i>');                
            listeBtn.append('a').attr('class',"badge text-bg-success rounded-pill  ms-2")
                .attr('target',"_blank")
                .attr('href',d=>d["dcterms:isReferencedBy"][0]["@id"])
                .html('<i class="fa-solid fa-link"></i>');
            listeBtn.append('a').attr('class',"badge rounded-pill")
                .attr('target',"_blank")
                .attr('href',d=>me.a.omk.getAdminLink(d))
                .html('<img height="32px" src="assets/img/OmekaS.png"></img>');
        }

        function extrapolerNote(e,d){
            console.log(d);

        }

        function addNoteBoxRef(e,d){

            let rs, type=e.currentTarget.id.substring(6);
            setTableFindRef([{'cherche':'rien'}]);            
            mRef.s.select('#modalAddRefTitre').html("Ajouter des personnes");
            mRef.s.select('#inptChercheLabel').html("Nom de la personne");                        
            mRef.s.select('#inptCherche').node().value = mNote.s.select('#inptDescNote').node().value;
            d3.select("#btnAddRefClose").on('click',(e,d)=>mRef.m.hide());        
            d3.select("#btnAddRefSave").on('click',setNoteBoxRef);        

            //TODO:gérer les validations https://getbootstrap.com/docs/5.3/forms/validation/
            d3.select("#btnFindRefBnF").on('click',(e,d)=>{
                findRef(type,"BnF")
            })
            d3.select("#btnFindRefWikidata").on('click',(e,d)=>{
                findRef(type,"Wikidata")
            })
            mNote.m.hide();
            mRef.m.show();
            console.log(rs);
        }

        function findRef(type,source){
            let cherche = mRef.s.select('#inptCherche').node().value;
            if(cherche){
                switch (type+source) {
                    case 'PersonBnF':
                        oBnf.findAuthor(cherche).then(rs => {
                            setTableFindRef(rs,type,source);
                        });                                
                        break;                
                    default:
                        break;
                }
            }
        }

        function setTableFindRef(data,type,source){
            //définition du header
            let headers = [];
            Object.keys(data[0]).forEach((k,i)=>{
                //ajoute la colonne de choix 
                if(i==0)headers.push('choisir');
                headers.push(k);
            });
            headers.push('type');
            headers.push('source');
            //construction du tableau
            hotResult = new Handsontable(d3.select('#hstRefFind').node(), {
                className: 'htDark',
                afterGetColHeader: function(col, TH){
                    TH.className = 'darkTH'
                },
                colHeaders: true,
                rowHeaders: true,
                data:data.map(d=>{
                    let r = {};
                    headers.forEach(h =>{
                        switch (h) {
                            case 'choisir':
                                r[h]= false;
                                break;
                            case 'type':
                                r[h]= type;
                                break;
                            case 'source':
                                r[h]= source;
                                break;
                            default:
                                r[h]= d[h].value;
                                break;
                        }
                    });
                    return r;
                }),
                colHeaders: headers,
                height: hotResultHeight+'px',
                width: '100%',
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

        function addBrush(e,d){
            e.stopImmediatePropagation();
            me.cont.selectAll('.meBrush').remove();
            let t = e.currentTarget.nodeName == "image" ?
                d3.select(e.currentTarget.parentNode) : d3.select(e.currentTarget), 
            bb = t.node().getBBox(), 
            sltBrush = [bb.x, bb.x+bb.width],
            brush = d3.brushX()
                //ajuster à la bande
                //.extent([[0, lineBand(d.line)], [d.trans.widthLine, lineBand(d.line)+lineBand.bandwidth()]])
                //
                .extent([[0, 0], [d.trans ? d.trans.widthLine : d.widthLine, heightLine]])
                .on("brush", s=>{
                    if (s) {
                        //console.log(s.selection);
                        let x = s.selection[0],
                            y = s.selection[1],
                            w = y > x ? y - x : x - y,
                            id = d.omk ? d.omk['o:id'] : d.id;
                            d.start=d.trans.scaleTime.invert(x);
                            d.end=d.trans.scaleTime.invert(y);
                        d3.select('#noteArrowLeft'+id).attr('x',x);
                        d3.select('#noteArrowRight'+id).attr('x',x+w-20);                        
                        d3.select('#noteMoveRect'+id).attr('x',x).attr('width',w);
                        d3.select('#noteRect'+id).attr('x',x).attr('width',w);
                        t.attr('x',x).attr('width',w);
                        d.x = x;
                        d.width = w;
                    }        
                })
                .on("end", s=>{
                    if (!s) {
                        gb.call(brush.move, sltBrush);
                    }else if(s.sourceEvent){
                        showNoteBox(e,d);
                        me.cont.select('.meBrush').remove();
                    }
            });    
            const gb = d3.select(e.currentTarget.parentElement).append("g")
                .attr('class','meBrush')
                .call(brush)
                .call(brush.move, sltBrush);
        }
        function audioPlay(e,d){
            console.log(d);
        }
        function audioEnd(e,d){
            if(continuousPlaying){
                //récupère le fragment suivant
                let url = 'cours-bnf/page/ajax?json=1&helper=sql&action=getNextTrans&idFrag='
                    +d.data[1][0].idFrag+'&idConf='+d.data[1][0].idConf;
                me.a.omk.getSiteViewRequest(url,data=>{
                    if(data.length==0){
                        let m=new modal({'size':'modal-sm','class':' text-bg-secondary',
                            'titre':'Aucun élément<i class="fa-solid fa-empty-set"></i><i class="fa-light fa-face-pensive"></i>',
                            'body':'<div>Vous avez consulté le dernier cours !</div><div class="my-2"><i class="fa-sharp fa-light fa-face-relieved fa-2xl"></i></div>'
                        });        
                    }else{
                        //vérifie si le fragment est déjà présent
                        let sFrag = d3.select('#frag_'+data[0].idFrag);
                        if(sFrag.size()){
                            sFrag.node().scrollIntoView();
                            /*
                            let posi = sFrag.node().getBoundingClientRect();
                            me.cont.node()
                                .scroll({
                                    top: posi.x,
                                    behavior: "auto",
                                    });
                            */
                            d3.select('#audio'+data[0].idFrag).node().play();                            
                        }

                    }
                })
            }
        }
        function audioProgress(e,d){
            let curTime = e.currentTarget.currentTime*1000; 
            //affichage la progression dans le svg
            d.data[1].forEach(t=>{
                let svg =  me.cont.select('#trans'+t.idTrans),
                svgData = svg.data()[0], 
                coursTime = svgData.start+curTime,
                scale = svgData.scaleTime,
                x = scale(coursTime);
                setTimeFocus(t.idTrans,x);
            })

        }
        function setTimeFocus(idTrans,x,idFrag=false,ct=false,play=false){
            //bouge le défilement
            me.cont.select('#transDefil'+idTrans)
                .attr("transform", `translate(${x},0)`);
            //bouge le scroll
            if(x > rectContRess.width/2)
                me.cont.select('#scrollTrans'+idTrans).node()
                    .scroll({
                        top: 0,
                        left: x-rectContRess.width/2,
                        behavior: "auto",
                        });
            //bouge le currentTime de l'audio
            if(idFrag && ct){
                let a = me.cont.select('#audio'+idFrag).node()
                a.currentTime = ct;
                if(play){
                    //met en pause tous les audios
                    me.cont.selectAll('audio').each(d=>{
                        me.cont.select('#audio'+d.id).node().pause();
                    });
                    //joue l'audio positionné
                    a.play();
                }
            }
        }

        function addTranscription(e){
            e.selectAll('div').data(v=>{
                return Array.from(d3.group(v.data[1], d => d.creator));
            }).enter()
                .append('div').attr('class',"row justify-content-center")
                .attr("class","transConceptLine")
                        .html(d=>{
                            return `<h6>${d[0]}
                            <a href="${me.a.omk.getAdminLink(null,d[1][0].idTrans,"o:Item")}" target="_blank">
                            <img src="assets/img/OmekaS.png" class="mx-2" height="20px" /></a></h6>`;
                        }).call(addConceptLine);
        }

        function addConceptLine(e){
            e.selectAll('div').remove();
            lineBand = d3.scaleBand(
                Array.apply(null, Array(nbLine)).map((x, i)=>i), 
                [0, heightLine-40]).paddingInner(0.2).paddingOuter(0);
            let bands = Array.apply(null, Array(nbLine*2)).map((x, i)=>i%nbLine).map((x, i)=>i>=nbLine ? x+"text" : x+'line').sort(),
            yBand = d3.scaleBand(
                bands, 
                [0, heightLine-20]).paddingInner(0.2).paddingOuter(0.2),
            fontSize = yBand.bandwidth()*2,
            divSvg = e.append('div')
                .attr('id',t=>'scrollTrans'+t[1][0].idTrans)
                .attr("class","overflow-x-scroll scrollable")
                .on("scroll", handleScroll),
            svg = divSvg.append('svg')
                .attr('id',t=>{
                    //TROP Gourmand t.omk = me.a.omk.getItem(t[1][0].idTrans);
                    t.start = Number.parseFloat(t[1][0].startFrag)*1000;
                    t.end = Number.parseFloat(t[1][0].endFrag)*1000;
                    t.dur = t.end-t.start;
                    t.idTrans = t[1][0].idTrans;
                    t.idFrag = t[1][0].idFrag;
                    t.widthLine = pixelParMilliseconde*t.dur;                             
                    t.scaleTime = d3.scaleLinear(
                        [t.start, t.end],
                        [0, t.widthLine] 
                    );
                    //récupère les notes
                    t.notes=[];
                    /*
                    if(t.omk["@reverse"] && t.omk["@reverse"]["oa:hasSource"]){
                        t.omk["@reverse"]["oa:hasSource"].forEach(r=>{                            
                            t.notes.push({'trans':t,'omk':me.a.omk.getResource(r["@id"])});
                        })
                    }
                    */
                    return 'trans'+t[1][0].idTrans
                })
                //.attr("viewBox", [0, 0, bb.width, heightLine])
                .attr("width", t=>t.widthLine)
                .attr("height", heightLine)
                .style('cursor','pointer')
                .on('click',clickTransCpt),
            //ajoute les concepts
            transCpt = svg.selectAll('g').data(t=>{
                    let data = [];
                    t[1].forEach((d,i)=>{
                        //gestion des temps
                        let start = t.start+Number.parseFloat(d.startCpt)*1000,
                            end = start+Number.parseFloat(d.endCpt)*1000;
                        //on alterne les mots en y pour éviter les chevauchements
                        d.yText = yBand(i%nbLine+"text");
                        d.yLine = yBand(i%nbLine+"line")+yBand.bandwidth()*1.5;
                        d.x1 = t.scaleTime(start);
                        d.x2 = t.scaleTime(end);
                    });
                    return t[1];
            }).enter().append('g')
                .style('cursor','zoom-in')
                .on('click',showConcept);
            
            //ajoute le texte des concepts          
            transCpt.append('text')
                .attr("x", d=> d.x1)
            	.attr("y",d => d.yText)
                .attr("fill",d=> {
                    if(me.selectConcepts.includes(d.titleCpt)){
                        selectConceptsPosis.push(d);
                        return "red"
                    }else return "white"
                })
                .style("font", fontSize+"px sans-serif")
                .text(d=>{
                    return d.titleCpt;
                })
                .on('mouseover',showConcept);
            //ajoute la ligne de durée
            transCpt.append('path')
                .attr('d', (d,i)=> {
                    return d3.line()([[d.x1, d.yLine], [d.x2, d.yLine]])
                })
                .attr('stroke', 'red')
                .attr('stroke-width',4)
                .on('mouseover',showConcept);

                 
            //gestion de l'axe
            let locale = d3.formatLocale({
                decimal: ".",
                thousands: " ",
                grouping: [3]
                }),
            xAxis = svg.append('g')
                .attr("id", t=>{
                    return 'transAxe'+t[1][0].idTrans;
                })
                .attr("transform", `translate(0,${heightLine - 40})`)
                .each(t=>{
                    svg.select('#transAxe'+t[1][0].idTrans).call(d3.axisBottom(t.scaleTime)
                        .ticks(pixelParMilliseconde*1000)
                        .tickSize(-heightLine)
                        //.tickFormat(locale.format(",.2f"))
                        .tickFormat(d3.timeFormat("%M:%S.%L"))
                    )
                });  
            xAxis.selectAll(".tick line")
                .attr("stroke","white")
                .attr("opacity",".6")
                .attr("stroke-dasharray","4");
            //ajoute la barre de défilement
            svg.append('g')
                .attr("id", t=>{
                    return 'transDefil'+t[1][0].idTrans;
                })
                .append('path')
                    .attr('d', (d,i)=> d3.line()([[0, 0], [0, heightLine]]))
                    .attr('stroke', 'green')
                    .attr('stroke-width',4); 
            //ajoute les notes enregistrées
            svg.call(addNoteBoxSave);            

            //place le focus sur le premier concept de chaque svg
            if(selectConceptsPosis.length){
                let grpSCP = Array.from(d3.group(selectConceptsPosis,d => d.idTrans), ([n, v]) => ({ n, v })); 
                grpSCP.forEach(scp=>{
                    setTimeFocus(scp.v[0].idTrans,scp.v[0].x1,scp.v[0].idFrag,scp.v[0].startCpt);
                });               
            }

        }
        function clickTransCpt(e,d){
            let x = e.offsetX, t = (d.scaleTime.invert(x)-d.start)/1000;
            setTimeFocus(d.idTrans,x,d.idFrag,t,false);            
        }
        //gestion des dates
        //merci à https://stackoverflow.com/questions/19700283/how-to-convert-time-in-milliseconds-to-hours-min-sec-format-in-javascript
        function msToTime(duration) {
            var milliseconds = Math.floor((duration % 1000) / 100),
              seconds = Math.floor((duration / 1000) % 60),
              minutes = Math.floor((duration / (1000 * 60)) % 60),
              hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
          
            hours = (hours < 10) ? "0" + hours : hours;
            minutes = (minutes < 10) ? "0" + minutes : minutes;
            seconds = (seconds < 10) ? "0" + seconds : seconds;
          
            return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
        }

        //synchronisation des scroll
        //merci à https://phuoc.ng/collection/html-dom/synchronize-scroll-positions-between-two-elements/
        const syncScroll = (scrolledEle, ele) => {
            const scrolledPercent = scrolledEle.scrollTop / (scrolledEle.scrollHeight - scrolledEle.clientHeight);
            const top = scrolledPercent * (ele.scrollHeight - ele.clientHeight);
    
            const scrolledWidthPercent = scrolledEle.scrollLeft / (scrolledEle.scrollWidth - scrolledEle.clientWidth);
            const left = scrolledWidthPercent * (ele.scrollWidth - ele.clientWidth);
    
            ele.scrollTo({
                behavior: "instant",
                top,
                left,
            });
        };
    
        function handleScroll(e,d){
            new Promise((resolve) => {
                requestAnimationFrame(() => resolve());
            });
            const scrolledEle = e.target;
            const elements = [...e.target.parentNode.parentNode.querySelectorAll(".scrollable")];

            elements.filter((item) => item !== scrolledEle).forEach((ele) => {
                ele.removeEventListener("scroll", handleScroll);
                syncScroll(scrolledEle, ele);
                window.requestAnimationFrame(() => {
                    ele.addEventListener("scroll", handleScroll);
                });
            });
        }; 
        
        function showConcept(e,d){
            e.stopImmediatePropagation();
            console.log(d.x1+' '+d.x2
                +' '+d.startCpt+' '+d.endCpt+' '+d.titleCpt
                +' '+d3.timeFormat("%M:%S.%L")(d.startCpt)
                +' '+d3.timeFormat("%M:%S.%L")(d.endCpt)
                +' '+d3.timeFormat("%M:%S.%L")(d.endCpt-d.startCpt)
                +' '+(d.endCpt-d.startCpt)
            );
        }
        
        function showFirstFragment(e,d){
            console.log(d);
        }
        function showPrevFragment(e,d){
            console.log(d);
        }
        function showNextFragment(e,d){
            console.log(d);
        }
        function showLastFragment(e,d){
            console.log(d);
        }

        function showParams(){

            if(!me.contParams.select("nav").size()){
                me.contParams.append('nav').attr('class',"navbar navbar-expand-lg bg-body-tertiary").html(`<div class="container-fluid">
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#transNavbar" aria-controls="transNavbar" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
                </button>
                    <div class="collapse navbar-collapse" id="transNavbar">
                        <ul class="navbar-nav me-auto mb-2 mb-lg-0 justify-content-center" id="transNavbarToolBar">
                        </ul>
                    </div>
                </div>`);
                me.toolbar = me.contParams.select("#transNavbarToolBar"); 
                me.toolbar.append('li').attr('class',"nav-item mx-2")
                    .append("button")
                        .attr('type',"button").attr('class',"btn btn-danger")
                    .on('click',loadParams)
                    .html(`<i class="fa-solid fa-upload"></i>`);    
                me.toolbar.append('li').attr('class',"nav-item mx-2")
                    .append("button")
                        .attr('type',"button").attr('class',"btn btn-danger")
                    .on('click',loadParams)
                    .html(`<i class="fa-solid fa-download"></i>`);    
                me.toolbar.append('li').attr('class',"nav-item mx-2")
                    .html(`<div  class="input-group">
                        <span class="input-group-text">Nb de fragment</span>
                        <input id="inptTransNbFrag" style="width:100px;" type="number" aria-label="Nb de fragment" class="form-control">
                        </div>`);

                me.toolbar.append('li').attr('class',"nav-item mx-2")
                    .append("button").attr('id',"btnTransShowParamsDetails")
                        .attr('type',"button").attr('class',"btn btn-danger")
                        .attr('data-bs-toggle',"collapse")
                        .attr('data-bs-target',"#contTransParamsDetails")
                        .attr('aria-expanded',"false")
                    .on('click',showParamsDetails)
                    .html(`<i class="fa-solid fa-screwdriver-wrench"></i>`);    
                            
                me.toolbar.append('li').attr('class',"nav-item mx-2")
                    .append("button")
                        .attr('type',"button").attr('class',"btn btn-danger")
                    .on('click',redrawTranscription)
                    .html(`<i class="fa-solid fa-comment-dots"></i>`)    

                    me.toolbar.append('li').attr('class',"nav-item mx-2")
                    .append("button")
                        .attr('type',"button").attr('class',"btn btn-danger")
                    .on('click',playContinuous)
                    .html(`<i class="fa-solid fa-recycle"></i>`)    
                    

                //ajoute les paramètres
                let contTransParamsDetails = me.contParams.append('div')
                    .attr('class','container-fluid collapse')
                    .attr('id','contTransParamsDetails'); 
                new slider({
                    'cont':contTransParamsDetails.append('div').attr('class','row px-2 py-2'),
                    'titre':'Hauteur des transcriptions',
                    'id':"tcTransSliderHauteurTrans",
                    'ext':[100,500],
                    'start':200,
                    'format':'unique',         
                    'fct':[{'e':'end','f':changeParams}]         
                });
                new slider({
                    'cont':contTransParamsDetails.append('div').attr('class','row px-2 py-2'),
                    'titre':'Nombre de ligne',
                    'id':"tcTransSliderNbLigne",
                    'ext':[1,10],
                    'start':3,
                    'format':'unique',         
                    'fct':[{'e':'end','f':changeParams}]         
                });
                new slider({
                    'cont':contTransParamsDetails.append('div').attr('class','row px-2 py-2'),
                    'titre':'Nombre de pixel par milliseconde',
                    'id':"tcTransSliderNbPixel",
                    'format':'unique',
                    'numberFormat':d3.format(".1f"),
                    'ext':[0.0,10.0],
                    'step':0.1,         
                    'start':0.5,         
                    'fct':[{'e':'end','f':changeParams}]         
                });
                                
            }else{
                me.toolbar = me.contParams.select("#transNavbarToolBar"); 
            }   
            me.toolbar.select("#inptTransNbFrag").node().value=me.cont.selectAll('.depth3').size();                            

            
        }

        function playContinuous(e,d){
            let btn = d3.select(e.currentTarget);
            if(btn.attr('class')=="btn btn-danger"){
                continuousPlaying = true;
                btn.attr('class',"btn btn-success");
            }else{
                continuousPlaying = true;
                btn.attr('class',"btn btn-danger");
            }

        }

        function loadParams(){
            console.log('loadParams');
        }

        function redrawTranscription(){
            heightLine = Number.parseInt(document.getElementById('tcTransSliderHauteurTrans').noUiSlider.get());
            nbLine = Number.parseInt(document.getElementById('tcTransSliderNbLigne').noUiSlider.get());
            pixelParMilliseconde = Number.parseFloat(document.getElementById('tcTransSliderNbPixel').noUiSlider.get());
            me.cont.selectAll(".transConceptLine").call(addConceptLine);
        }

        function showParamsDetails(){
            let cls = me.toolbar.select("#btnTransShowParamsDetails").attr('class');
            if(cls=="btn btn-success" || cls=="btn btn-success collapsed"){
                me.toolbar.select("#btnTransShowParamsDetails").attr('class',"btn btn-danger")                
            }else{
                me.toolbar.select("#btnTransShowParamsDetails").attr('class',"btn btn-success")                
            }
        }
        function changeParams(vals,params){
            d3.select("#redrawTranscription").attr('class',"btn btn-success")
                .html(`<i class="fa-solid fa-comment-dots  fa-beat-fade"></i>`)    

        }



        this.init();
    }
}