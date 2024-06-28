import {appUrl} from './appUrl.js';
import {modal} from './modal.js';
export class streamWords {
    constructor(params) {
        var me = this;
        this.id = params.id ? params.id : 'streamwords';
        this.cont = params.cont ? params.cont : d3.select("#canvas");
        this.urlData = params.urlData ? params.urlData : false;
        this.data = params.data ? params.data : false;
        this.fct = params.fct ? params.fct : false;
        this.cat = params.cat ? params.cat : false;
        this.aUrl = params.aUrl ? params.aUrl : false;
        this.noWords = params.noWords ? params.noWords : ['Lucky Semiosis','Collectif','Samuel Szoniecky'];            
        this.noWordsPart = params.noWordsPart ? params.noWordsPart : [];//['GitHub'];            
        this.replaceWords = params.replaceWords ? params.replaceWords : [['GitHub User : ','']];            
        const width = params.width ? params.width : 600;
        const height = params.height ? params.height : 600;
        const config = {
            minFont: 12,
            maxFont: 25,
            tickFont: 12,
            legendFont: 12,
            curve: d3.curveMonotoneX,
            topWord: 1000,
            fct:{'nodeClick':showItem,'legendClick':showCat,'showProcess':showProcess}
            };
        const m=new modal({'size':'modal-lg'}); 
        let dataForVis = [], authors=[], words=[], svg, wCat,
            margins = {t:10,b:10,l:10,r:10}, nivs, 
            mNoeud = m.add('modalStreamNode'),
            mParams = m.add('modalStreamParams');

        this.init = function () {
            setData();
        }

        function setData(){
            showLoader();       
            d3.json(me.urlData).then(data=>{
                console.log(data);
                me.data = data;
                dataForVis = getDataForVis(data);                
                console.log(dataForVis);
                if(me.cat)me.changeCat(me.cat)
                else createStream(dataForVis);
            });            
        }
        function createStream(data){
            let w = width-margins.l-margins.r, h = height - margins.t - margins.b, maxH=0;
            me.cont
                .style("max-width", w + "px")
                .style("background-color","white");
            me.cont.select('svg').remove();
            svg = me.cont.append('svg').attr("id", "mainSVG");    
            svg.attr("width", Math.max(120 * data.length, w));
            //calcul la hauteur maximale
            let cats = Object.keys(data[0].words);
            data.forEach(d=>{
                cats.forEach(c=>maxH=d.words[c].length>maxH?d.words[c].length:maxH);                
            })
            svg.attr("height", 2*Math.max(maxH, h));
            wordstream(svg, data, config);
            hideLoader(true);
        }

        function getDataForVis(data){
            dataForVis=[];
            //calcul le coéfficient de fréquence
            nivs = d3.extent(data.rapports.map(d=>d.niv));
            //regroupement par année
            data.rapports.forEach(d=>d.an=parseInt(d.date.split('-')[0]));
            data.rapports.sort((a, b) => a.an - b.an);
            let g = d3.group(data.rapports, d => d.an),
            //création des catégories
            typeCat = "actants";//'keywords & authors',//"words for each author"
            wCat = getWordCat(data,typeCat);
            g.forEach((docs,date)=>{
                let o = {'date':date,'words':JSON.parse(JSON.stringify(wCat)),'docs':[]};
                docs.forEach(d=>{
                    o.docs.push(d);
                    switch (typeCat) {
                        case "words for each author":
                            d.authIdHal_s.forEach(ka=>{
                                getKeywords(d,o,'keywords for '+ka);
                            })                    
                            break;            
                        case "actants":
                            let topic;
                            //création du topic suivant la propriété
                            switch (d.idCpt) {
                                //case 6://Contributor  
                                case 325://participant
                                case 61://list of contributors  
                                    topic = 'projets';    
                                    break;
                                default:
                                    if(d.niv==0)topic ='publications';
                                    else if(d.typeDate=='dcterms:date') topic ='références'
                                    else if(d.typeDate=="dcterms:dateSubmitted") topic ='annotations';
                                    else topic = 'inclassables'
                                    /*trop groumand
                                    else topic = data.docs.filter(c=>c.id==d.idDoc)[0].class;
                                    */
                                    break;
                            }
                            if(topic)getAuthors(d,o,topic);
                            break;            
                        case "keywords & authors":
                        default:
                            getKeywords(d,o,'keywords');
                            getAuthors(d,o);
                            break;                            
                    }
                })
                dataForVis.push(o)
            })
            //trier les résultats 
            sortDataForViz('frequency')
            return dataForVis;
        }

        function sortDataForViz(champ, dir='desc'){

            dataForVis.forEach(d=>{
                for (const k in d.words) {
                    d.words[k].sort((a, b) => {
                        return dir=='desc' ? b[champ] - a[champ] : a[champ] - b[champ];
                    });
                }
            })

        }

        function getKeywords(d,o,k){
            let doc = me.data.docs.filter(f=>f.id==d.idDoc)[0];
            if(!doc.kw){
                doc.kw = nlp(cleanText(doc.title)).terms().json();
            }            
            doc.kw.forEach(t=>{                
                //exclusion des nombres
                if(t.text && isNaN(t.text))setWord(t.text,o,k,d,nivs[1]-d.niv);
            })            
            let cpt = me.data.concepts.filter(f=>f.id==d.idCpt)[0];
            //exclusion des propriétés
            if(cpt.class!='property')setWord(cpt.title,o,k,d,3*(nivs[1]-d.niv));    
        }
        function getAuthors(d,o,t='authors'){
            let exclude=false, fi, 
                k = o.date, a,
                doc = me.data.docs.filter(f=>f.id==d.idDoc)[0],
                act = me.data.actants.filter(f=>f.id==d.idAct)[0],
                /*pondère la fréquence par la complexité
                ATTENTION cela met en avant les publication avec beaucoup de co-auteurs
                frq = parseInt(doc.cpx);
                */
                frq = 1;//6*(nivs[1]-d.niv);
            //exclusion de luckysemiosis & Samuel Szoniecky...            
            if(me.noWords.includes(act.title))return;
            //exclusion des Github : user
            me.noWordsPart.forEach(wp=>{
                if(act.title.includes(wp) && !exclude)exclude=true;
            })
            if(exclude)return;            
            //remplace des expressions
            me.replaceWords.forEach(rw=>act.title=act.title.replace(rw[0],rw[1]));
                        
            a = o.words[t].filter(d=>d.text==act.title);
            if(a.length==0){
                o.words[t].push({frequency: frq,id: act.id,text:act.title,topic:t,'d':[d]})
            }else{
                a[0].frequency += frq;
                a[0].d.push(d);
            }
        }
        
        function getWordCat(data,type){
            let w={}, cat; 
            switch (type) {
                case "words for each author":
                    cat = d3.group(data, d => d.authIdHal_s ? d.authIdHal_s : ["No IdHal"]);            
                    cat.forEach((v,k)=>{
                        k.forEach(a=>{
                            if(!w['keywords for '+a]){
                                w['keywords for '+a]=[];
                            }
                        });
                    });
                    break;    
                case "actants":
                    w = {'publications':[],'projets':[],'références':[],'annotations':[]};//,'inclassables':[]};
                    /*trop gourmand
                    cat = d3.group(data.docs, d => d.class);            
                    cat.forEach((v,k)=>{
                        if(!w[k])w[k]=[];
                    });
                    */
                    break;
                case "keywords & authors":
                default:
                    w = {'keywords':[],'authors':[]};
                break;
            }
            return w;
        }
        function cleanText(t){
            t = t.replace(/.'/, '')
            .replace(/.’/, '')
            .replace(/.'/, '')
            .replace(/.’/, '')               
            .replace(/[.,\/#!,«»$%\^&\*;:{}=\-_`~()"َّ"]/mg," ")
            .replace(/\.\s+|\n|\r|\0/mg,' ')
            .replace(/\s-+\s/mg,' ')
            .replace(/[©|]\s?/mg,' ')
            .replace(/[!(–?$”“…]/mg,' ')
            .replace(/\s{2,}|^\s/mg,' ');
            t = sw.removeStopwords(t.split(' '),sw.fra);
            t = sw.removeStopwords(t,sw.eng);
            
            return t.join(' ');
        }
        
        function setWord(w,o,t,d,p=1){
            //console.log(t);
            let fi, k = o.date, aw = o.words[t].filter(d=>d.text==w);
            if(aw.length==0){
                fi = words.findIndex(d=>d==w);
                if(fi<0){
                    words.push(w);
                    fi = words.length-1;
                }
                o.words[t].push({frequency: 1,id: k+"_"+t+"_"+fi,text:w,topic:t,'d':d})
            }else
                aw[0].frequency = aw[0].frequency+(1*p);
        }                                                          
        this.changeCat = function(cat){
            showLoader();       
            let dataCat = [];
            dataForVis.forEach(d=>{
                let nD = JSON.parse(JSON.stringify(d));
                for (const k in nD.words) {
                    if(k!=cat)nD.words[k]=[];
                }
                if(nD.words[cat].length)dataCat.push(nD);
            })
            createStream(dataCat);
        }
        function showCat(e,d){
            console.log(d);
        }
        function showProcess(process,param){
            console.log(process,param);
        }
        
        function showItem(e,d){
            let idItem = "";
            switch (d.topic) {
                case "authors":
                case "co-auteur":
                case "publications":
                case "références":
                case "annotations":
                case "inclassables":
                case "projets":
                        idItem = d.d.idAct                    
                    break;            
                case "keywords":
                    idItem = d.d.idCpt                    
                    break;                                
            }
            mNoeud.s.select('#streamNodeTitre').text(d.text+' : '+d.d[0].date);
            let docs = [], doublons=[];
            d.d.forEach(dd=>{
                if(!doublons[dd.idDoc]){
                    docs.push(me.data.docs.filter(doc=>doc.id==dd.idDoc)[0]);
                    doublons[dd.idDoc]=true;
                }
            })
            mNoeud.s.select('#streamNodeTab').selectAll('li').remove();
            mNoeud.s.select('#streamNodeTab').selectAll('li').data(docs).enter()
                .append('li').attr('class',"nav-item").attr('role',"presentation")
                    .append('button').attr('class',(doc,i)=>i==0 ? "nav-link active" : "nav-link")
                    .attr('id',doc=>'node'+doc.id)
                    .attr('data-bs-toggle',"tab")
                    .attr('data-bs-target',doc=>'#node'+doc.id+"-pane")
                    .attr('type',"button").attr('type',"button")
                    .attr('role',"tab").attr('aria-controls',doc=>'node'+doc.id+"-pane")
                    .attr('aria-selected',(doc,i)=>i==0?'true':'false').text(doc=>doc.title);
            mNoeud.s.select('#streamNodeTabContent').selectAll('div').remove();
            mNoeud.s.select('#streamNodeTabContent').selectAll('div').data(docs).enter()
                .append('div').attr("class",(doc,i)=>i==0?"tab-pane fade show active":"tab-pane fade")
                .attr('id',doc=>'node'+doc.id+"-pane")
                .attr('role',"tabpanel").attr('aria-labelledby',doc=>'node'+doc.id)
                .attr('tabindex',(doc,i)=>i).html(doc=>{
                    return '<iframe class="fiche" src="../../omk/s/fiches/item/'+doc.id+'"/>'
                });
            mNoeud.m.show();
        }

        this.showParams = function(){
            //gestion des sliders
            var data = [0, 10, 100, 1000];
            var sliderSimple = d3
                .sliderBottom()
                .min(d3.min(data))
                .max(d3.max(data))
                .width(600)
                //.tickFormat(d3.format('.2%'))
                .ticks(5)
                .default(10)
                .on('onchange', (val) => {
                    mParams.s.select('#value-H').text(parseInt(val));
                });
            var gSimple = d3
                .select('#slider-H')
                .append('svg')
                .attr('width', "100%")
                .attr('height', 100)
                .append('g')
                .attr('transform', 'translate(30,30)');
            gSimple.call(sliderSimple);
                 
            /*
            mNoeud.s.select('#streamNodeTitre').text(d.text+' : '+d.d[0].date);
            let docs = [], doublons=[];
            d.d.forEach(dd=>{
                if(!doublons[dd.idDoc]){
                    docs.push(me.data.docs.filter(doc=>doc.id==dd.idDoc)[0]);
                    doublons[dd.idDoc]=true;
                }
            })
            mNoeud.s.select('#streamNodeTab').selectAll('li').remove();
            mNoeud.s.select('#streamNodeTab').selectAll('li').data(docs).enter()
                .append('li').attr('class',"nav-item").attr('role',"presentation")
                    .append('button').attr('class',(doc,i)=>i==0 ? "nav-link active" : "nav-link")
                    .attr('id',doc=>'node'+doc.id)
                    .attr('data-bs-toggle',"tab")
                    .attr('data-bs-target',doc=>'#node'+doc.id+"-pane")
                    .attr('type',"button").attr('type',"button")
                    .attr('role',"tab").attr('aria-controls',doc=>'node'+doc.id+"-pane")
                    .attr('aria-selected',(doc,i)=>i==0?'true':'false').text(doc=>doc.title);
            mNoeud.s.select('#streamNodeTabContent').selectAll('div').remove();
            mNoeud.s.select('#streamNodeTabContent').selectAll('div').data(docs).enter()
                .append('div').attr("class",(doc,i)=>i==0?"tab-pane fade show active":"tab-pane fade")
                .attr('id',doc=>'node'+doc.id+"-pane")
                .attr('role',"tabpanel").attr('aria-labelledby',doc=>'node'+doc.id)
                .attr('tabindex',(doc,i)=>i).html(doc=>{
                    return '<iframe class="fiche" src="../../omk/s/fiches/item/'+doc.id+'"/>'
                });
            */
            mParams.m.show();
        }        
        

        this.init();    
    }
}