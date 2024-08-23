import {slider} from './slider.js';
import {modal} from './modal.js';
import {bnf} from './bnf.js';

export class transcription {
    constructor(config={}) {
        var me = this;
        this.cont = config.cont ? config.cont : d3.select('body'); 
        this.contParams = config.contParams ? config.contParams : false;
        this.toolbar = config.toolbar ? config.toolbar : false;
        this.vals = config.vals ? config.vals : [];  
        this.selectConcepts = config.selectConcepts ? config.selectConcepts : [];  
        this.a = config.a ? config.a : [];  
        let rectContRess, 
            heightLine = 200, nbLine = 3, lineBand, 
            pixelParMilliseconde = 0.5,
            colorBox = '#ffc00870',
            selectConceptsPosis=[], 
            mNote, noteBox=[], 
            //en milliseconde
            margeBox = 100,
            oBnf = new bnf(), hotResult, hotResultHeight=400;
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
                let av = a.idConf+a.trackMediaConf+Number.parseFloat(a.startFrag),
                bv = b.idConf+b.trackMediaConf+Number.parseFloat(b.startFrag);
                return av-bv;
            })
            let hFrags = d3.hierarchy(d3.group(me.vals, 
                    d => d.titleConf, d => d.trackMediaConf, d => d.idFrag, 
                    //d => d.creator, d => d.startCpt+'->'+d.endCpt
                    )),
            labels = hFrags.descendants().map(d => {
                d.typeNode = d.depth > 2 ? 'div' : 'H'+(3+d.depth);
                let dt = d.leaves()[0].data;
                switch (d.depth) {
                    case 0:
                        d.label = 'Cours'
                        d.id = 'Cours'
                        break;       
                    case 1:
                        d.label = d.data[0];
                        d.id = 'omk'+dt.idConf;
                        d.omk = me.a.omk.getItem(dt.idConf);
                        break;       
                    case 2:
                        d.label = d.data[0];
                        d.id = 'omk'+dt.idMediaConf;
                        d.omk = me.a.omk.getMedia(dt.idMediaConf);
                        break;       
                    case 3:
                        d.label = 'Fragment '
                            +d3.timeFormat("%M:%S")(Number.parseFloat(dt.startFrag)*1000)
                            +' -> '
                            +d3.timeFormat("%M:%S")(Number.parseFloat(dt.endFrag)*1000);
                        d.id = 'omk'+d.data[0];
                        d.omk = me.a.omk.getMedia(d.data[0]);
                        break;       
                    case 4:
                        d.label = d.data[0];
                        d.id = 'omk'+dt.idTrans;
                        d.omk = me.a.omk.getItem(dt.idTrans);
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
                    .attr('id',d=>d.id)
                    .html(d=>d.label);
            //ajoute les compléments de l'arbre
            me.cont.selectAll('.depth1,.depth2,.depth3').call(addLinkReference);
            me.cont.selectAll('.depth3').call(addFragment);
            //suprime les dimensions inutiles
            me.cont.selectAll('.depth4').remove();
            //ajoute la barre des paramètres
            if(me.contParams)showParams();            
        }
        
        function addLinkReference(e){
            e.append('a').attr('href',d=>{
                    return d.omk["dcterms:source"] ? d.omk["dcterms:source"][0]["@id"] : '';
                }).attr('target',"_blank")
                .style('display', d=> d.omk["dcterms:source"] ? "inline" : "none")
                .append('img').attr('src','assets/img/Logo_BnFblanc.svg')
                    .attr('class','mx-2')
                    .style("height","20px");
            e.append('a').attr('href',d=>{
                    return me.a.omk.getAdminLink(d.omk)
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
                    return v.omk["o:original_url"];
                })
                .attr("class","mx-2").attr("controls",true)
                .style("height", "24px")
                .on("play",audioPlay)
                .on("timeupdate",audioProgress)
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
            me.cont.select('#'+d.id).selectAll('svg').call(s=>addNoteBox(s,curTime));
        }
        function addNoteBoxSave(svg,d){
            let boxes = svg.selectAll('.noteBoxSave').data(t=>t.notes)
                .enter().append('g').attr('id',nb=>{
                    nb.start = Number.parseFloat(nb.omk["oa:start"][0]["@value"]);
                    nb.end = Number.parseFloat(nb.omk["oa:end"][0]["@value"]);
                    return 'note'+nb.omk['o:id'];
                })
                .attr('class','noteBoxSave')
                .call(createNoteBox);    
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
                    return 'noteRect'+(nb.omk ? nb.omk['o:id'] : nb.id)
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
                    nb.color = nb.omk ? nb.omk['jdc:degradColors'][0]['@value'] : colorBox;
                    return nb.color;
                })
                .style('cursor','zoom-in')                
                .on('click',showNoteBox);
            //ajoute les boutons de déplacement
            boxes.append('rect')
                .attr('id',nb=>'noteMoveRect'+(nb.omk ? nb.omk['o:id']: nb.id))
                .attr('x',nb=>nb.x)
                .attr('y',heightLine-20)
                .attr('height',20)
                .attr('width',nb=>nb.width)
                .attr('fill',"white")
                .style('cursor','col-resize')                
                .on('click',addBrush);    
            boxes.append('image')
                .attr('id',nb=>'noteArrowLeft'+(nb.omk ? nb.omk['o:id']: nb.id))
                .attr('x',nb=>nb.x)
                .attr('y',heightLine-20)
                .attr('height',20)
                .attr('width',20)
                .attr('xlink:href',"assets/img/left-arrow.svg")
                .style('cursor','col-resize')                
                .on('click',addBrush);    
            boxes.append('image')
                .attr('id',nb=>'noteArrowRight'+(nb.omk ? nb.omk['o:id']: nb.id))
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
            mNote.m.show();

            mNote.s.select('#inptNoteDeb').node().value = d3.timeFormat("%M:%S.%L")(note.start);
            mNote.s.select('#inptNoteDebVal').node().value = note.start;
            mNote.s.select('#inptNoteFin').node().value = d3.timeFormat("%M:%S.%L")(note.end);
            mNote.s.select('#inptNoteFinVal').node().value = note.end;
            mNote.s.select('#inptNoteColor').node().value = d3.color(note.color).formatHex();                
            mNote.s.select('#inptIdNote').node().value = note.omk ? note.omk['o:id'] : "";
            //on met à jour le titre à chaque fois
            //l'utilisateur peut juste changer la description
            mNote.s.select('#inptTitreNote').node().value = 
                'Note '+note.trans.idFrag
                    +'-'+note.trans.idTrans           
                    +' : '+d3.timeFormat("%M:%S.%L")(note.start)+' -> '+d3.timeFormat("%M:%S.%L")(note.end);            
            if(note.omk && note.omk["dcterms:description"])
                mNote.s.select('#inptDescNote').node().value = note.omk["dcterms:description"][0]["@value"];
            mNote.s.select('#inptIdFrag').node().value = note.trans.idFrag;
            mNote.s.select('#inptIdTrans').node().value = note.trans.idTrans;            
        }
        function saveNoteBox(e,d){
            //récupère les données
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
            if(idNote){                
                //mise à jour dans omk
                me.a.omk.updateRessource(idNote, data,'items',null,"PATCH",i=>{
                    console.log(i);
                    redrawTranscription();
                });
            }else{
                //enregistre dans omk
                me.a.omk.createItem(data,i=>{
                    console.log(i);
                    redrawTranscription();
                });
            }
        }

        function deleteNoteBox(e,d){
            console.log(d);
        }

        function addNoteBoxRef(e,d){

            let m=new modal({'size':'modal-lg'}),
                mRef = m.add('modalAddRef'), rs, cherche;
            setTableFindRef([{'cherche':'rien'}]);            
            mRef.s.select('#modalAddRefTitre').html("Ajouter des personnes");
            mRef.s.select('#inptChercheLabel').html("Nom de la personne");                        
            mRef.s.select('#inptCherche').node().value = "";
            d3.select("#btnAddRefClose").on('click',(e,d)=>mRef.m.hide());        
            d3.select("#btnAddRefSave").on('click',(e,d)=>{
                let refSelect = hotResult.getData().filter(r=>r[0]),
                liste = mNote.s.select('#lstNodeBoxPerson').selectAll('li').data(refSelect).enter()
                    .append('li').attr('class',"list-group-item list-group-item-warning d-flex justify-content-between align-items-start"),
                listeBody = liste.append('div').attr('class',"ms-2 me-auto"),
                listeBtn = liste.append('div').attr('class',"d-flex align-items-center");
                listeBody.append('div').attr('class',"fw-bold")                    
                    .text(d=>{
                        return d[1];
                    });
                listeBody.append('p').html(d=>{
                        return `<i class="fa-solid fa-cake-candles"></i> ${d[2]}
                            <i class="fa-solid fa-skull"></i> ${d[3]}`;
                    });
                listeBtn.append('button').attr('class',"btn btn-danger badge rounded-pill")
                    .html('<i class="fa-solid fa-trash-can"></i>');
                listeBtn.append('a').attr('class',"badge text-bg-success rounded-pill  ms-2")
                    .attr('target',"_blank")
                    .attr('href',d=>d[4])
                    .html('<i class="fa-solid fa-link"></i>');
                listeBtn.append('a').attr('class',"badge rounded-pill")
                    .attr('target',"_blank")
                    .attr('href',d=>d[4])
                    .html('<img height="32px" src="assets/img/OmekaS.png"></img>');
                mRef.m.hide();
                mNote.m.show();
            });        

            //TODO:gérer les validations https://getbootstrap.com/docs/5.3/forms/validation/
            d3.select("#btnFindRefBNF").on('click',(e,d)=>{
                cherche = mRef.s.select('#inptCherche').node().value;
                if(cherche){
                    oBnf.findAuthor(cherche).then(rs => {
                        setTableFindRef(rs);
                    })
                    .catch(error => {
                        console.error(error);
                    });                         
                }
            })
            d3.select("#btnFindRefWikidata").on('click',(e,d)=>{
                cherche = mRef.s.select('#inptCherche').node().value;
                if(cherche)rs = oBnf.findAuthor(cherche);
            })
            mNote.m.hide();
            mRef.m.show();
            console.log(rs);
        }

        function setTableFindRef(data){
            let headers = Object.keys(data[0]);
            //ajoute la colonne de choix 
            headers.unshift('choisir');
            hotResult = new Handsontable(d3.select('#hstRefFind').node(), {
                className: 'htDark',
                afterGetColHeader: function(col, TH){
                    TH.className = 'darkTH'
                },
                colHeaders: true,
                rowHeaders: true,
                data:data.map(d=>{
                    let r = {};
                    headers.forEach(h => r[h]= h=='choisir' ? false : d[h].value);
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
                /*ajuster à la bande
                .extent([[0, lineBand(d.line)], [d.trans.widthLine, lineBand(d.line)+lineBand.bandwidth()]])
                */
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
                let a = me.cont.select('#audioomk'+idFrag).node()
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
                            <a href="${me.a.omk.getAdminLink(null,d[1][0].idTrans)}" target="_blank">
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
                    t.omk = me.a.omk.getItem(t[1][0].idTrans);
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
                    if(t.omk["@reverse"] && t.omk["@reverse"]["oa:hasSource"]){
                        t.omk["@reverse"]["oa:hasSource"].forEach(r=>{                            
                            t.notes.push({'trans':t,'omk':me.a.omk.getResource(r["@id"])});
                        })
                    }
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
                    for (let i = 0; i < t.omk["curation:data"].length; i++) {
                        let d = t.omk["curation:data"][i];
                        d.idTrans = t[1][0].idTrans;
                        d.idFrag = t[1][0].idFrag;
                        //gestion des temps
                        d.fragStart = Number.parseFloat(d["@annotation"]["oa:start"][0]["@value"]);
                        d.start = t.start+d.fragStart*1000;
                        d.end = t.start+
                            Number.parseFloat(d["@annotation"]["oa:end"][0]["@value"])*1000;
                        //on alterne les mots en y pour éviter les chevauchements
                        d.yText = yBand(i%nbLine+"text");
                        d.yLine = yBand(i%nbLine+"line")+yBand.bandwidth()*1.5;
                        d.x1 = t.scaleTime(d.start);
                        d.x2 = t.scaleTime(d.end);
                        d.label = d["@annotation"]["jdc:hasConcept"][0].display_title
                    }
                    return t.omk["curation:data"];
            }).enter().append('g');
            //ajoute le texte des concepts          
            transCpt.append('text')
                .attr("x", d=> d.x1)
            	.attr("y",d => d.yText)
                .attr("fill",d=> {
                    if(me.selectConcepts.includes(d.label)){
                        selectConceptsPosis.push(d);
                        return "red"
                    }else return "white"
                })
                .style("font", fontSize+"px sans-serif")
                .text(d=>{
                    return d.label;
                })
                .on('mouseover',showConcept);
            //ajoute la ligne de durée
            transCpt.append('path')
                .attr('d', (d,i)=> d3.line()([[d.x1, d.yLine], [d.x2, d.yLine]]))
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
                    setTimeFocus(scp.v[0].idTrans,scp.v[0].x1,scp.v[0].idFrag,scp.v[0].fragStart);
                });               
            }

        }
        function clickTransCpt(e,d){
            let x = e.offsetX, t = (d.scaleTime.invert(x)-d.start)/1000;
            setTimeFocus(d.idTrans,x,d.idFrag,t,true);            
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
            console.log(d.x1+' '+d.x2
                +' '+d.start+' '+d.end+' '+d.label
                +' '+d3.timeFormat("%M:%S.%L")(d.start)
                +' '+d3.timeFormat("%M:%S.%L")(d.end)
                +' '+d3.timeFormat("%M:%S.%L")(d.end-d.start)
                +' '+(d.end-d.start)
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
