import {slider} from './slider.js';
import {modal} from './modal.js';

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
            mNote, noteBox=[];
        this.init = function () {
            //initialisation des contenus
            me.cont.selectAll('*').remove();
            rectContRess = me.cont.node().getBoundingClientRect();
            selectConceptsPosis=[];
            let m=new modal({'size':'modal-lg'}),
                arrNoteButtons = [
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
            arrNoteButtons.forEach(b=>mNote.s.select('#'+b.id).on('click',b.fct))


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
        function addNoteBox(svg,t){
            let margeBox = 20,
                boxes = svg.append('g').attr('id','box'+noteBox.length)
                    .attr('class','noteBox')
                    /*ajouter une box par bande
                    .selectAll('rect').data(d=>Array.apply(null, Array(nbLine)).map((x, i)=>{
                        return {'line':i,'trans':d};
                    })).enter().append('rect')
                    .attr('x',d=>{
                        return d.trans.scaleTime(d.trans.start+t);
                    })
                    */
                   //ajouter une boxe
                    .append('rect')
                    .attr('x',d=>d.scaleTime(d.start+t))
                    .attr('y',0)
                    .attr('height',heightLine)
                    .attr('width',margeBox)
                    .attr('fill',colorBox)
                    .style('cursor','zoom-in')                
                    .on('click',showNoteBox);
        }
        function showNoteBox(e,d){
            e.stopImmediatePropagation();
            mNote.m.show();
            let start = d.scaleTime.invert(e.offsetX),
                end = d.scaleTime.invert(e.offsetX+e.currentTarget.width.baseVal.value);            
            mNote.s.select('#inptNoteDeb').node().value = d3.timeFormat("%M:%S.%L")(start);
            mNote.s.select('#inptNoteDebVal').node().value = start;
            mNote.s.select('#inptNoteFin').node().value = d3.timeFormat("%M:%S.%L")(end);
            mNote.s.select('#inptNoteFinVal').node().value = end;
            mNote.s.select('#inptTitreNote').node().value = 
                'Note '+(noteBox.length+1)+' pour le fragment '+d.idFrag+' et la transcription '+d.idTrans;            
            mNote.s.select('#inptIdFrag').node().value = d.idFrag;
            mNote.s.select('#inptIdTrans').node().value = d.idTrans;            
            addBrush(e,d);
        }
        function saveNoteBox(e,d){
            //récupère les données
            let start = mNote.s.select('#inptNoteDebVal').node().value,
                end = mNote.s.select('#inptNoteFinVal').node().value,
                titre = mNote.s.select('#inptTitreNote').node().value,
                desc = mNote.s.select('#inptDescNote').node().value,
                idFrag = mNote.s.select('#inptIdFrag').node().value,
                idTrans = mNote.s.select('#inptIdTrans').node().value; 
            //enregistre dans omk
            me.a.omk.createItem({
                'o:resource_class':'bibo:Note',
                "dcterms:title":titre, 
                "dcterms:description":desc,
                "ma:hasFragment":{'rid':idFrag},
                "oa:hasSource":{'rid':idTrans},
                "oa:start":start,
                "oa:end":end,
            },i=>{
                console.log(i);
            });
        }

        function deleteNoteBox(e,d){
            console.log(d);
        }

        function addNoteBoxRef(e,d){
            console.log(d);
        }

        function addBrush(e,d){
            me.cont.selectAll('.meBrush').remove();
            let t = d3.select(e.currentTarget), bb = t.node().getBBox(), 
            sltBrush = [bb.x, bb.x+bb.width],
            brush = d3.brushX()
                /*ajuster à la bande
                .extent([[0, lineBand(d.line)], [d.trans.widthLine, lineBand(d.line)+lineBand.bandwidth()]])
                */
                .extent([[0, 0], [d.widthLine, heightLine]])
                .on("brush", s=>{
                    if (s) {
                        //console.log(s.selection);
                        t.attr('x',s.selection[0]);
                        t.attr('width',s.selection[1] > s.selection[0] ? s.selection[1] - s.selection[0] : s.selection[0] - s.selection[1]);
                    }        
                })
                .on("end", s=>{
                    if (!s) {
                        gb.call(brush.move, sltBrush);
                    }else if(s.sourceEvent){
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
                            return '<h6>'+d[0]+'</h6>';
                        }).call(addConceptLine);
        }
        function addConceptLine(e){
            e.selectAll('div').remove();
            lineBand = d3.scaleBand(
                Array.apply(null, Array(nbLine)).map((x, i)=>i), 
                [0, heightLine-20]).paddingInner(0.2).paddingOuter(0);
            let bands = Array.apply(null, Array(nbLine*2)).map((x, i)=>i%nbLine).map((x, i)=>i>=nbLine ? x+"text" : x+'line').sort(),
            yBand = d3.scaleBand(
                bands, 
                [0, heightLine]).paddingInner(0.2).paddingOuter(0.2),
            fontSize = yBand.bandwidth()*2,
            divSvg = e.append('div')
                .attr('id',t=>'scrollTrans'+t[1][0].idTrans)
                .attr("class","overflow-x-scroll scrollable")
                .on("scroll", handleScroll),
            svg = divSvg.append('svg')
                .attr('id',t=>{
                    t.omk = me.a.omk.getItem(t[1][0].idTrans);
                    return 'trans'+t[1][0].idTrans
                })
                //.attr("viewBox", [0, 0, bb.width, heightLine])
                .attr("width", t=>{
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
                    return t.widthLine;
                })
                .attr("height", heightLine)
                .style('cursor','pointer')
                .on('click',clickTransCpt),
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
            //ajoute des concepts          
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
                .attr("transform", `translate(0,${heightLine - 20})`)
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
