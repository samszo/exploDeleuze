/**
 * 
 * 
 * merci à http://www.jasondavies.com/wordcloud/
 */
import {loader} from './loader.js';
import {slider} from './slider.js';

export class tagcloud {
    constructor(config={}) {
    var me = this;
    this.cont = config.cont ? config.cont : d3.select('body');  
	this.idDoc = config.idDoc ? config.idDoc : 'tc';  
	this.user = config.user ? config.user : false; 
	this.h = config.h ? config.h : 600; 
	this.w = config.w ? config.w : 800; 
	this.colorTag = config.colorTag ? config.colorTag : {'select':'red','visit':'green','over':'orange','init':'white'}; 
    this.keyTag = config.keyTag ? config.keyTag : 'titleCpt';
    this.fct = config.fct ? config.fct : false;
    this.omk = config.omk ? config.omk : false;
    this.contParams = config.contParams ? config.contParams : false;
    this.toolbar = config.toolbar ? config.toolbar : false;
	this.sauve = config.sauve; 
	this.global = config.global;  
	this.verif = config.verif;  
	this.txt = config.txt;  
	this.data = config.data;
	this.term = config.term;
	this.utiWords = config.utiWords;
	this.poidsTag = 1;
	this.urlJson = config.urlJson;
	this.div = config.div;
    this.tags = [];
    this.loader = new loader();

	// From 
	// Jonathan Feinberg's cue.language, see lib/cue.language/license.txt.
	// 
	this.stopWords = /^(tout|comme|fois|puis|encore|aussi|quoi|aujourd|hui|tôt|lors|plus|estce|vousmême|puisqu|estàdire|très|cela|alors|donc|etc|for|tant|au|en|un|une|aux|et|mais|par|c|d|du|des|pour|il|ici|lui|ses|sa|son|je|j|l|m|me|moi|mes|ma|mon|n|ne|pas|de|sur|on|se|soi|notre|nos|qu|s|même|elle|t|que|celà|la|le|les|te|toi|leur|leurs|eux|y|ces|ils|ce|ceci|cet|cette|tu|ta|ton|tes|à|nous|ou|quel|quels|quelle|quelles|qui|avec|dans|sans|vous|votre|vos|été|étée|étées|étés|étant|suis|es|est|sommes|êtes|sont|serai|seras|sera|serons|serez|seront|serais|serait|serions|seriez|seraient|étais|était|étions|étiez|étaient|fus|fut|fûmes|fûtes|furent|sois|soit|soyons|soyez|soient|fusse|fusses|fût|fussions|fussiez|fussent|ayant|eu|eue|eues|eus|ai|as|avons|avez|ont|aurai|auras|aura|aurons|aurez|auront|aurais|aurait|aurions|auriez|auraient|avais|avait|avions|aviez|avaient|eut|eûmes|eûtes|eurent|aie|aies|ait|ayons|ayez|aient|eusse|eusses|eût|eussions|eussiez|eussent|i|me|my|myself|we|us|our|ours|ourselves|you|your|yours|yourself|yourselves|he|him|his|himself|she|her|hers|herself|it|its|itself|they|them|their|theirs|themselves|what|which|who|whom|whose|this|that|these|those|am|is|are|was|were|be|been|being|have|has|had|having|do|does|did|doing|will|would|should|can|could|ought|i'm|you're|he's|she's|it's|we're|they're|i've|you've|we've|they've|i'd|you'd|he'd|she'd|we'd|they'd|i'll|you'll|he'll|she'll|we'll|they'll|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|doesn't|don't|didn't|won't|wouldn't|shan't|shouldn't|can't|cannot|couldn't|mustn't|let's|that's|who's|what's|here's|there's|when's|where's|why's|how's|a|an|the|and|but|if|or|because|as|until|while|of|at|by|for|with|about|against|between|into|through|during|before|after|above|below|to|from|up|upon|down|in|out|on|off|over|under|again|further|then|once|here|there|when|where|why|how|all|any|both|each|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|say|says|said|shall)$/;
	this.punctuation = /["“!()&*+,-\.\/:;<=>?\[\\\]^`\{|\}~]+/g;
	this.elision = /[’'’''0123456789]+/g;
	this.wordSeparators = /[\s\u3031-\u3035\u309b\u309c\u30a0\u30fc\uff70]+/g;
	
    let fill = d3.scaleOrdinal(d3.schemeSet3),
        planW, planH, zoom,
        hpt, gTags,
        complete = 0,
        maxLength = 30,
        minLength = 2,
        maxTag = 3000,
        minmaxFont = [12, 96],
        statusText, posiTxt,
        svg, vis, bbVis, tooltip, ext, fontSize, initWords,
        contParamsDetails;	    

	this.init = function() {
        me.loader.show();

            //initialisation des éléments graphiques
            me.cont.selectAll('div').remove();
            me.cont.select('svg').remove();
            
            //gestion des données
            if(me.data){
                if(me.verif)me.verif = me.data;
                me.data = parseData();
            }
            if(me.txt){
                me.data=parseText();
                //hypertextualise seulement les sélections des utilisateurs
                if(me.user){
                    hypertextualise();	    		
                }
                //colorise le term de la recherche
                if(me.term)showTerm();
            }
            ext = d3.extent(me.data.map(function(x) { return parseInt(x.value); }));
            fontSize =  d3.scaleLog().domain([ext[0],ext[1]]).range(minmaxFont);

            //création de la cartographie
            planW=me.w*6, planH=me.h*6;
            svg = me.cont.append("svg")
                .attr("id", "svg_"+me.idDoc)
                .attr("viewBox", [0, 0, me.w, me.h])
                .attr("width", me.w)
                .attr("height", me.h)
                .attr("style", "max-width: 100%; height: auto;");
            vis = svg.append("g");
                    //.attr("transform", "translate(" + [me.w >> 1, me.h >> 1] + ")"); 
            //gestion du zoom
            zoom = d3.zoom()
                .extent([[0, 0], [planW, planH]])
                .scaleExtent([0, 10])
                .on("zoom", zoomed);              
            svg.call(zoom);
            function zoomed({transform}) {
                vis.attr("transform", transform);
            }

            //création des éléments graphiques
            if(me.contParams)showParams();
            setTagCloud();
            setToolTip();

		}

        function showParams(){

        if(!me.contParams.select("nav").size()){
            me.contParams.append('nav').attr('class',"navbar navbar-expand-lg bg-body-tertiary").html(`<div class="container-fluid">
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#tcNavbar" aria-controls="tcNavbar" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
            </button>
                <div class="collapse navbar-collapse" id="tcNavbar">
                    <ul class="navbar-nav me-auto mb-2 mb-lg-0 justify-content-center" id="tcNavbarToolBar">
                    </ul>
                </div>
            </div>`);
            me.toolbar = me.contParams.select("#tcNavbarToolBar"); 
            me.toolbar.append('li').attr('class',"nav-item mx-2")
                .append("button").attr('id',"btnSaveParams")
                    .attr('type',"button").attr('class',"btn btn-danger")
                .on('click',loadParams)
                .html(`<i class="fa-solid fa-upload"></i>`);    
            me.toolbar.append('li').attr('class',"nav-item mx-2")
                .append("button").attr('id',"btnLoadParams")
                    .attr('type',"button").attr('class',"btn btn-danger")
                .on('click',loadParams)
                .html(`<i class="fa-solid fa-download"></i>`);    
            me.toolbar.append('li').attr('class',"nav-item mx-2")
                .html(`<div  class="input-group">
                    <span class="input-group-text">Nb de concept</span>
                    <input id="inptNbCptTot" style="width:100px;" type="number" aria-label="First name" class="form-control">
                    </div>`);

            me.toolbar.append('li').attr('class',"nav-item mx-2")
                .append("button").attr('id',"btnShowParamsDetails")
                    .attr('type',"button").attr('class',"btn btn-danger")
                    .attr('data-bs-toggle',"collapse")
                    .attr('data-bs-target',"#contParamsDetails")
                    .attr('aria-expanded',"false")
                .on('click',showParamsDetails)
                .html(`<i class="fa-solid fa-screwdriver-wrench"></i>`);    
                      
            me.toolbar.append('li').attr('class',"nav-item mx-2")
                .append("button").attr('id',"btnRedrawCloud")
                    .attr('type',"button").attr('class',"btn btn-danger")
                .on('click',redrawTagCloud)
                .html(`<i class="fa-solid fa-cloud"></i>`)    
    

            //ajoutre les paramètres
            contParamsDetails = me.contParams.append('div')
                .attr('class','container-fluid collapse')
                .attr('id','contParamsDetails'); 
            new slider({
                'cont':contParamsDetails.append('div').attr('class','row px-2 py-2'),
                'titre':'Nombre de tag maximum',
                'id':"tcSliderNbTagMax",
                'ext':[1,10000],
                'start':3000,
                'format':'unique',         
                'fct':[{'e':'end','f':changeParams}]         
            });
            new slider({
                'cont':contParamsDetails.append('div').attr('class','row px-2 py-2'),
                'titre':'Interval de la taille des tags',
                'id':"tcSliderIntTailleTag",
                'ext':[0,100],         
                'start':[2,30],         
                'fct':[{'e':'end','f':changeParams}]         
            });
            new slider({
                'cont':contParamsDetails.append('div').attr('class','row px-2 py-2'),
                'titre':'Interval des occurrences',
                'id':"tcSliderIntOcc",
                'ext':ext,         
                'start':ext,         
                'fct':[{'e':'end','f':changeParams}]         
            });
            new slider({
                'cont':contParamsDetails.append('div').attr('class','row px-2 py-2'),
                'titre':'Interval des tailles de police',
                'id':"tcSliderIntTaillePolice",
                'ext':[1,200],         
                'start':[12,96],
                'fct':[{'e':'end','f':changeParams}]         
            });
            contParamsDetails.append('div').attr('class','row px-2 py-2')
                .html(`<div class="mb-3">
                    <label for="tcStopWords" class="form-label">Mots exclus</label>
                    <textarea class="form-control" id="tcStopWords" rows="3">${me.stopWords}</textarea>
                  </div>`)
            
        }else{
            me.toolbar = me.contParams.select("#tcNavbarToolBar"); 
        }   
        me.toolbar.select("#inptNbCptTot").node().value=gTags.length;                            

            /*
            let s = me.cont.append('div').attr('id',"tools_"+me.idDoc);
            statusText = me.cont.append('div').attr('id',"status_"+me.idDoc);
            posiTxt = me.cont.append('div').attr('id',"select_txt_"+me.idDoc);            
            if(posiTxt){
                hpt  = posiTxt.clientHeight;
                if(hpt>me.h)me.h=hpt;
            }
            if(me.toolbar)setToolbar();
            setSlider(s);
            */
            
        }

        function showParamsDetails(){
            let cls = me.toolbar.select("#btnShowParamsDetails").attr('class');
            if(cls=="btn btn-success" || cls=="btn btn-success collapsed"){
                me.toolbar.select("#btnShowParamsDetails").attr('class',"btn btn-danger")                
            }else{
                me.toolbar.select("#btnShowParamsDetails").attr('class',"btn btn-success")                
            }
        }
        function changeParams(vals,params){
            d3.select("#btnRedrawCloud").attr('class',"btn btn-success")
                .html(`<i class="fa-solid fa-cloud fa-beat-fade"></i>`)    

        }

        function redrawTagCloud(){
            d3.select("#btnRedrawCloud").attr('class',"btn btn-danger")
                .html(`<i class="fa-solid fa-cloud"></i>`)    

        }

        function loadParams(){
            console.log('loadParams');
        }

        function setToolTip(){
            let html = `<div class="card text-bg-secondary mb-3" style="width: 18rem;">
            <div class="card-body">
              <h5 id="ttTitre" class="card-title">Card title</h5>
              <h6 id="ttSousTitre" class="card-subtitle mb-2 text-body-secondary">Card subtitle</h6>
              <p id="ttTexte" class="card-text">Some quick example text to build on the card title and make up the bulk of the card's content.</p>
              <a id="ttLinkCpt" href="#" target="_blank" class="card-link link-light">Voir le concept</a>
            </div>
          </div>`
          tooltip = d3.select("body")
            .append("div")
            .style("position", "absolute")
            .style("z-index", "10")
            .style("visibility", "hidden")
            .html(html);


        }
        function setTagCloud(){
            d3.layout.cloud().size([planW, planH])
                .words(me.data)
                .rotate(0)
                .spiral("rectangular")
                //
                .fontSize(function(d) {
                    /*
                    var n = d.value*16;
                    if(me.user){
                        var uw = inUtiWords(d.key);
                        if(uw) n = uw.value*8;
                    }
                    if(me.global)n=fontSize(d.value);
                    if(n>me.h)n=me.h/2;
                    */
                    let n=fontSize(d.value);
                    return n; 
                })
                //
                .text(function(d) { 
                    return d.key; 
                    })
                .on("word", progress)
                .on("end", draw)
                .start();

        }
		    	



		function draw(words,wordExt,values=false,param=false) {
            if(!values){
                ext = d3.extent(words.map(function(x) { return parseInt(x.value); }));
                initWords = words;
            }else{
                vis.selectAll("text").remove();
                words = initWords.filter(w=>w.value>=values[0] && w.value<=values[1]);
            }
			var text = vis.selectAll("text")
		        .data(words)
			    .enter().append("text")
		    	  	//.style("fill", function(d) { return fill(d.text.toLowerCase()); })
		    	  	.style("fill", function(d) {
                        return me.colorTag.init;
		    	  	})
		        	.style("font-size", function(d) { 
		        		return d.size + "px"; 
		        		})
			        .attr("text-anchor", "middle")
		    	    .attr("transform", function(d) { return "translate(" + [d.x, d.y] + ")rotate(" + d.rotate + ")"; })
		        	.text(function(d) { return d.text; })
		        	.on("click", function(e, d) {
                        me.loader.show();
                        d.select = d.select ? false : true;
                        let t = d3.select(e.target);
                        vis.selectAll("text").style("fill",me.colorTag.init);
                        t.style("fill",me.colorTag.select)
                            .attr('class',d.select?"textSelect":"");
                        if(me.fct.clickTag){
                            me.fct.clickTag(d,vis.selectAll(".textSelect"));
                        }
                        me.loader.hide();
		        	})
		        	.on("mouseover", function(e, d) { 
                        if(d.select)return;
                        d3.select(this).style("fill", me.colorTag.over);
		        	})
		        	.on("mouseout", function(e, d) {
                        tooltip.style("visibility", "hidden");
                        if(d.select)return; 
		        		d3.select(e.target).style("fill", me.colorTag.visit);
                    })
	    	        .on("mousemove", function(e, d){
                        tooltip
                            .style("visibility", "visible");
                        tooltip.select('#ttTitre').text(d.text);
                        tooltip.select('#ttSousTitre').text(d.vals.length+' fragment(s)');
                        tooltip.select('#ttTexte').remove();
                        tooltip.select('#ttLinkCpt').remove();
                        //tooltip.select('#ttLinkCpt').attr('href',me.omk.api.replace("/api/","/admin/item/")+d.vals[0].idCpt);
                        let bb = tooltip.node().getBoundingClientRect(),
                            hautbas = e.pageY < (bbVis.height+bbVis.y)/2 ? -10 : -bb.height,
                            droitegauche = e.pageX < bbVis.width/2 ? 10 : -10-bb.width;
                        tooltip
			        		.style("top", (e.pageY+hautbas)+"px")
			        		.style("left",(e.pageX+droitegauche)+"px")

	    	        	})
		        	.attr("cursor", "pointer")
		        	;
            //replace le tagcloud au centre
            bbVis = vis.node().getBBox();
            let x0=bbVis.x,x1=bbVis.x+bbVis.width,y0=bbVis.y,y1=bbVis.y+bbVis.height;
            //vis.attr('transform','scale('+(planW/bb.width)+')translate('+(bb.width/2)+','+(bb.height/2)+')')

            svg.transition().duration(750).call(
              zoom.transform,
              d3.zoomIdentity
                .translate(me.w / 2, me.h / 2)
                .scale(Math.min(8, 0.9 / Math.max((x1 - x0) / me.w, (y1 - y0) / me.h)))
                .translate(-(x0 + x1) / 2, -(y0 + y1) / 2)
            );            

            if(me.fct.drawEnd){
                me.fct.drawEnd(vis.selectAll("text"));
            }

            me.loader.hide(true);

		}
		function progress(d) {
            complete ++;
            if(me.toolbar){
                //me.toolbar.select("#inptNbProcessTot").node().value=Math.min(maxTag, me.data.length);                
                //me.toolbar.select("#inptNbProcess").node().value=complete;                
            }
		}
				
		function parseText() {
			me.tags = {};
			var cases = {};
			me.txt.split(me.wordSeparators).forEach(function(word) {
				var j = word.search("&quot;");
				if(j==0){
					word = word.substr(6);
				}else if(j>0){
					word = word.substr(0, j);
				}
				var i = word.search(me.elision);
				if(i>0)word = word.substr(i+1);
				word = word.replace(me.punctuation, "");
				if (me.stopWords.test(word.toLowerCase())) return;
				if (word.length <= minLength) return;
		    	if(me.user){
		    		var uw = inUtiWords(word);
		    		if(uw.value<0) return;
		    	}				
				word = word.substr(0, maxLength);
				cases[word.toLowerCase()] = word;
				me.tags[word = word.toLowerCase()] = (me.tags[word] || 0) + 1;
			});
			me.tags = d3.entries(me.tags).sort(function(a, b) { return b.value - a.value; });
			me.tags.forEach(function(d) {d.key = cases[d.key];});
			return me.tags;
		}

		function parseData() {

            gTags = Array.from(d3.group(me.data, (d) => d[me.keyTag])).map(d=>{ return {'value': d[1].length,'k':d[0],'vals':d[1]};}).sort(function (a, b) {
                return b.value - a.value;
              });
			me.tags = [];
			var j=0;
			gTags.forEach((t)=> {
				if (t.value <= 0) return;
				if(j>=maxTag) return;
				var word = t.k;
				var i = word.search(me.elision);
				if(i>0) word = word.substr(i+1);
				word = word.replace(me.punctuation, "");
				var wlc = word.toLowerCase();
				if (me.stopWords.test(wlc)) return;
				if (word.length <= minLength) return;
				word = word.substr(0, maxLength);
                me.tags.push({'key':word,'vals':t.vals,'value':t.value});
				j++;
			});
			return me.tags;
		}
		
		function inUtiWords(txt) {
            if(!me.utiWords)return false;
			for(var i= 0; i < me.utiWords.length; i++)
			{
                if(txt.toLowerCase()==me.utiWords[i]['code']){
                    return me.utiWords[i];					 
                } 
            }
            return false;
		}
		function hypertextualise() {
			 var d, reg, str;
			 for(var i= 0; i < me.data.length; i++)
			 {
				 d = me.data[i];
				 reg=new RegExp("("+d.key+")", "g");
				 str = "<span id='tag_"+me.idDoc+"' class='tag' v='"+d.value+"'>$1</span>";
				 me.txt =  me.txt.replace(reg, str);
			 }
		}

		function showTerm() {
			var arr = me.term.split(" and ");
			if(arr.length==1) arr = me.term.split(" or ");
			 for(var i= 0; i < arr.length; i++)
			 {
				 reg=new RegExp("("+arr[i]+")", "g");
				 str = "<span id='tag_"+me.idDoc+"' class='term' >$1</span>";
				 me.txt =  me.txt.replace(reg, str);				 
			 }			
		}

        if(me.urlJson){
            d3.json(me.urlJson).then(donnes=>{
                me.data = donnes;
                me.init();
            });
        } else {
            me.init();
        }
		
    };      
}
