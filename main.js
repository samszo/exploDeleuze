import {modal} from './modules/modal.js';
import {auth} from './modules/auth.js';
import {tagcloud} from './modules/tagcloud.js';
import {loader} from './modules/loader.js';

        let m=new modal({'size':'modal-lg'}), 
            tc, 
            hotRes, 
            accordion = document.getElementById('accordionJDC'),
            rectAccordion = accordion.getBoundingClientRect(),
            rectFooter = d3.select('footer').node().getBoundingClientRect(),
            rectHeader = d3.select('header').node().getBoundingClientRect(),
            rectMap = d3.select('#contentMap').node().getBoundingClientRect(),
            hMap = rectFooter.top-rectFooter.height-rectHeader.bottom,
            wMap = rectMap.width,
            wait = new loader();
            

        //dimensionne la carte
        d3.select('#contentMap').style('height',hMap+"px");
        let  rectChart = d3.select('#contentMap').node().getBoundingClientRect(),
            a = new auth({'navbar':d3.select('#navbarMain'),
                mail:'samuel.szoniecky@univ-paris8.fr',
                apiOmk:'../omk_deleuze/api/',
                ident: 'lBBNzw1HsXS4UhOwur0xE3nvNgOWapNv',
                key: 'NUHcMUVsolp4PSFfZYGGh5Z01eLClbML'
            });
        //log l'utilisateur
        a.getUser(u=>{
            console.log(u);
            let listSeminar = a.omk.searchItems('resource_class_id=47');
            listSeminar.slice(0, {'o:title':'All','o:id':0});
            setMenu('#ddSeminar', listSeminar,'o:title',showSeminar);
            wait.hide();
        });
        //gestion des event de l'ihm
        d3.select("#btnNewFragment").on('click',e=>{
            console.log(e);
        })        
        
        accordion.addEventListener('shown.bs.collapse', event => {
            /*
            if(event.target.id=="collapseThree"){
                hotCpx = setTable(dataDetails.csv,d3.select('#contentDetails'),hotCpx);
            }
            if(event.target.id=="collapseFour"){
                hotRes = setTable(dataDetails.infos.resources,d3.select('#contentResources'), hotRes);
            }
            */
        })

        //fonctions de l'ihm
        function showSeminar(e,d){
            wait.show();
            let url = a.omk.api.replace('api/','')+"s/cours-bnf/page/ajax?json=1&helper=sql&action=statConcept";
            d3.json(url).then(function(rs) {
                console.log('data seminaire : OK');
                tc=new tagcloud({
                    'cont':d3.select('#contentMap'),'user':a.omk.user,'data':rs,
                    'w':wMap, 'h':hMap, 
                    fct:{'clickTag':showFrags}
                }) 
            });                            
        }

        function showFrags(d,slt){
            console.log(d);
            //ouvre l'accordion
            d3.select("#collapseFour").attr('class',"accordion-collapse collapse show");           
            //initialisation des contenus
            let cont = d3.select("#contentResources");
            cont.selectAll('div').remove();
            //regroupe les valeurs par vidéo
            let vals = d3.merge(slt.data().map(s=>s.vals)),
                gFrags = Array.from(d3.group(vals,v=>v.idVideo));
            //ajoute les références omk aux vidéos et à la translation
            gFrags.forEach(v=>{
                v.frag = a.omk.getMedia(v[1][0].idFrag);
                v.trans = a.omk.getItem(v[1][0].idR);
            })
            //création des vidéos
            let cards = cont.selectAll('div').data(gFrags).enter().append('div').attr('class','col-12').append('div').attr('class','card');
            cards.append('video').attr('src',v=>v.frag["o:original_url"]).attr("class","card-img-top").attr("controls",true);
            let cardBody = cards.append('div').attr("class","card-body");
            cardBody.append('h5').attr("class","card-title").text(v=>v.frag['o:title']);
            cardBody.append('p').attr("class","card-text").selectAll('span').data(v=>getDataWords(v)).enter()
                .append('span')
                .attr('class','spanTag')
                .style('color',d=>d.select?'red':'white')    
                .style('font-size',d=>d.select?'large':'small')    
                .text(d=>d.t)
                .on('click',showTagTools);
            cardBody.append('div').attr("class","card-footer text-body-secondary")
                .append("a").attr("href",v=>v.trans['@id']);
        }

        function showTagTools(e,d){
            console.log(d);
        }

        function getDataWords(d){
            return d.trans['o:title'].split(' ').map(t=>{
                return {'data':d,'t':t,'select':t==d[1][0].titleCpt}
            });
        }

        function setTable(data, cont, hot, menu){
            if(hot){                
                hot.clear();
                if(data)hot.updateData(data);
                else hot.updateData([]);
                //hot.render()
            }else{
                let headers = Object.keys(data[0]),
                    menuContext = menu ? {
                        callback(key, selection, clickEvent) {
                          // Common callback for all options
                          console.log(key, selection, clickEvent);
                        },
                        items: {
                          complexity: { // Own custom option
                            name() { // `name` can be a string or a function
                              return `<button type="button" id="btnComplexityItem" class="btn btn-sm btn-danger">
                                        <i class="fa-solid fa-calculator"></i>
                                    </button>`;
                            },
                            callback(key, s, e) { // Callback for specific option
                                let r = this.getDataAtRow(s[0].start.row);
                                getData(urlApiOmk+'id='+r[1]);
                            }
                          }
                        }
                      } : menu;
                hot = new Handsontable(cont.append('div').node(), {
                    className: 'htDark',
                    afterGetColHeader: function(col, TH){
                        TH.className = 'darkTH'
                    },
                    colHeaders: true,
                    rowHeaders: true,
                    data:data,
                    colHeaders: headers,
                    height: (rectFooter.top-rectFooter.height-rectHeader.bottom)/2,
                    width: '100%',
                    licenseKey: 'non-commercial-and-evaluation',
                    customBorders: true,
                    dropdownMenu: true,
                    multiColumnSorting: true,
                    filters: true,
                    selectionMode:'single',
                    columns: getCellEditor(headers),
                    allowInsertColumn: false,
                    copyPaste: false,
                    contextMenu: menuContext,
                    search: true,                        
                });
            }
            return hot;
        }