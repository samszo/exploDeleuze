import {loader} from './loader.js';
export class omk {
    constructor(params) {
        var me = this;
        this.modal;
        this.key = params.key ? params.key : false;
        this.ident = params.ident ? params.ident : false;
        this.mail = params.mail ? params.mail : false;
        this.api = params.api ? params.api : false;
        this.vocabs = params.vocabs ? params.vocabs : ['dcterms','ma','oa','jdc','bibo','skos','foaf','bio'];
        this.loader = new loader();
        this.user = false;
        this.props = [];
        this.class = [];
        this.medias = [];
        this.items = [];
        this.owners = []
        this.resources = [];
        this.rts
        this.queries = [];
        let perPage = 100, types={'items':'o:item','media':'o:media'};
                
        this.init = function () {
            //récupères les propriétés
            me.vocabs.forEach(v=>{
                me.getProps(v);
                me.getClass(v);
            })
            me.setRT();
            me.loader.hide(true);
        }
        this.setRT = function (cb=false){
            me.rts = syncRequest(me.api+'resource_templates?per_page=1000');
            if(cb)cb(me.rts);
        }
        this.getRt = function (label){
            return me.rts.filter(rt=>rt['o:label']==label)[0];                        
        }
        this.getRtById = function (id){
            return me.rts.filter(rt=>rt['o:id']==id)[0];                        
        }
        this.getRtId = function (label){
            return me.rts.filter(rt=>rt['o:label']==label)[0]['o:id'];                        
        }
        this.getProps = function (prefix, cb=false){
            let url = me.api+'properties?per_page=1000&vocabulary_prefix='+prefix,                
                data = syncRequest(url);
            data.forEach(p=>me.props.push(p));
            if(cb)cb(me.props);
        }
        this.getPropId = function (t){
            return me.props.filter(prp=>prp['o:term']==t)[0]['o:id'];                        
        }
        this.getPropByTerm = function (t){
            return me.props.filter(prp=>prp['o:term']==t)[0];                        
        }
        this.getClass = function (prefix, cb=false){
            let url = me.api+'resource_classes?per_page=1000&vocabulary_prefix='+prefix,                
                data = syncRequest(url);
            data.forEach(c=>me.class.push(c));
            if(cb)cb(data);
        }

        this.getClassByName = function (cl){
            let c = me.class.filter(c=>c['o:label'].toLowerCase()==cl.toLowerCase());
            return c[0];
        }

        this.getClassByTerm = function (cl){
            let c = me.class.filter(c=>c['o:term'].toLowerCase()==cl.toLowerCase());
            return c[0];
        }

        this.getRandomItemByClass = function (cl, cb=false){
            let url;
            try {
                url = me.api+'items?resource_class_id='
                    +me.getClassByName(cl)['o:id'];
            } catch (error) {
                console.error(error);
            }              
            let rs = syncRequest(url),
            r = rs[Math.floor(Math.random()*rs.length)];
            if(cb)cb(r);                    
            return r;
        }

        this.getMedias= async function(p,linkMedia=''){
            p.medias = [];
            p['o:media'].forEach(m=>{
                p.medias.push(syncRequest(m['@id']))
            })
            if(linkMedia && p[linkMedia])me.getLinkMedias(p,linkMedia);
        }
        this.getLinkMedias=function(p,linkMedia){
            p.medias = p.medias ? p.medias : [];
            p[linkMedia].forEach(i=>{
                let item = syncRequest(i['@id']);
                me.getMedias(item);
                item.medias.forEach(m=>{
                    p.medias.push(m);
                })
            })
        }

        this.getResource = function (url, cb=false){
            if(me.resources[url])return me.resources[url];
            let rs = syncRequest(url);
            me.resources[url]=rs;
            if(cb)cb(rs);                    
            return rs;
        }
        this.getResourceType = function (id, type, cb=false){
            let url = me.api+type+'/'+id;
            if(me.resources[url])return me.resources[url];
            let rs = syncRequest(url);
            me.resources[url]=rs;
            if(cb)cb(rs);                    
            return rs;
        }


        this.updateRessource = function (id, data, type='items', fd=null, m='PUT',cb=false, dataOri=false){
            let oriData, newData, url = me.api+type+'/'+id+'?key_identity='+me.ident+'&key_credential='+me.key;
            if(data){
                //récupère les données originales
                oriData = dataOri ? dataOri : me.getResourceType(id,type), 
                newData = me.formatData(data,types[type]);
                //met à jour les données
                for (const p in newData) {
                    if(p!='@type'){
                        //vérifie si la propriété est dans les données originales                        
                        if(oriData[p]){
                            //m=="PUT" : on ajoute les nouvelles valeurs
                            if(m=="PUT")oriData[p]=oriData[p].concat(newData[p]);
                            //m=="PATCH" : on modifie les valeurs
                            if(m=="PATCH")oriData[p]=newData[p];          
                        }else{
                            //ajoute la nouvelle propriété dans les données
                            oriData[p]=newData[p];
                        }     
                    }
                }
            }
            postData({'u':url,'m':m}, fd ? fd : oriData).then((rs) => {
                me.items[rs['o:id']]=rs;
                if(cb)cb(rs);
            });

        }        

        this.getItem = function (id, cb=false){
            if(me.items[id])return me.items[id];
            let url = me.api+'items/'+id,
                rs = syncRequest(url);
            me.items[id]=rs;
            if(cb)cb(rs);                    
            return rs;
        }

        this.getOwner = function (id, cb=false){
            if(me.owners[id])return me.owners[id];
            let url = me.api+'users/'+id+'?key_identity='+me.ident+'&key_credential='+me.key,
                rs = syncRequest(url);
            me.owners[id]=rs;
            if(cb)cb(rs);                    
            return rs;
        }
        

        this.getMedia = function (id, cb=false){
            if(me.medias[id])return me.medias[id];
            let url = me.api+'media/'+id,
                rs = syncRequest(url);
            me.medias[id]=rs;
            if(cb)cb(rs);                    
            return rs;
        }        

        this.getAdminLink = function(r,id=false,type=false){
            if(!type)type = r['@type'][0];
            return type=="o:Item" ?
                me.api.replace("/api/","/admin/item/")+(id ? id : r['o:id'])
                : me.api.replace("/api/","/admin/media/")+(id ? id : r['o:id'])             
        }
        this.getMediaLink = function(file){
            return me.api.replace("/api","")+file;
        }

        //merci à https://stackoverflow.com/questions/33780271/export-a-json-object-to-a-text-file/52297652#52297652
        this.saveJson=function(data){
            const filename = 'data.json';
            const jsonStr = JSON.stringify(data);
            
            let element = document.createElement('a');
            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(jsonStr));
            element.setAttribute('download', filename);
            
            element.style.display = 'none';
            document.body.appendChild(element);            
            element.click();
            document.body.removeChild(element);            
        }

        this.getAllItems = function (query, cb){
            let url = me.api+'items?per_page='+perPage+'&'+query+'&page=', fin=false, rs=[], data, page=1;
            //pause pour gérer l'affichage du loader
            //setTimeout(function(){
                while (!fin) {
                    data = syncRequest(url+page);
                    //console.log(url+page,data);
                    fin = data.length ? false : true;
                    rs = rs.concat(data);
                    page++;
                }                
                return cb ? cb(rs) : rs;                    
            //}, 100);
        }

        this.getAllMedias = function (query, cb=false){
            let url = me.api+'media?per_page='+perPage+'&'+query+'&page=', fin=false, rs=[], data, page=1;
            while (!fin) {
                data = syncRequest(url+page);
                //console.log(url+page,data);
                fin = data.length ? false : true;
                rs = rs.concat(data);
                page++;
            }                
            if(cb)cb(rs);                    
            return rs;
        }

        this.searchItems = function (query, cb=false, sync=true){
            let url = me.api+'items?'+query,rs; 
            if(sync){
                rs = syncRequest(url);
                if(cb)cb(rs);                    
            }
            else
                request(url,cb);
            return rs;
        }

        this.getUser = function (cb=false){
            let url = me.api+'users?email='+me.mail+'&key_identity='+me.ident+'&key_credential='+me.key;                
            d3.json(url).then((data) => {
                me.user = data.length ? data[0] : false;
                //TODO: mieux gérer anythingLLM Login
                me.user.anythingLLM = syncRequest(me.api.replace('api/','s/cours-bnf/page/ajax?json=1&helper=anythingLLMlogin'));
                if(cb)cb(me.user);
            });

        }

        this.createItem = function (data, cb=false, verifDoublons){
            if(verifDoublons){
                let items = me.searchItems(verifDoublons);
                if(items.length){
                    if(cb)cb(items[0]);
                    return items[0];
                }
            }
            let url = me.api+'items?key_identity='+me.ident+'&key_credential='+me.key;
            postData({'u':url,'m':'POST'}, me.formatData(data)).then((rs) => {
                me.items[rs['o:id']]=rs;
                if(cb)cb(rs);
            });
        }

        this.getConcept = async function (concept){
            //vérifie l'existence du concept
            let query = "property[0][joiner]=and&property[0][property]="
                +me.getPropId('dcterms:title')
                +"&property[0][type]=eq&property[0][text]="+concept
                +"&resource_class_id[]="+me.getClassByTerm('skos:Concept')['o:id'],            
            items = me.searchItems(query);
            if(items.length)return items[0];
            let url = me.api+'items?key_identity='+me.ident+'&key_credential='+me.key,
                data = {
                    'o:resource_class':'skos:Concept',
                    "dcterms:title":concept, 
                    "skos:prefLabel":concept,
                };
            return await postData({'u':url,'m':'POST'}, me.formatData(data));
        }

        this.formatData = function (data,type="o:Item"){
            let fd = {"@type" : type},p;
            for (let [k, v] of Object.entries(data)) {
                switch (k) {
                    case 'o:item_set':
                        fd[k]=[{'o:id':v}];
                        break;
                    case 'o:resource_class':
                        p = me.getClassByTerm(v);                        
                        fd[k]={'o:id':p['o:id']};            
                        break;
                    case 'o:resource_template':
                        p = me.rts.filter(rt=>rt['o:label']==v)[0];                        
                        fd[k]={'o:id':p['o:id']};            
                        break;
                    case 'o:media':
                        if(!fd[k])fd[k]=[];
                        fd[k].push({"o:ingester": "url", "ingest_url":v});                                
                        break;
                    case 'file':
                        fd['o:media']=[{"o:ingester": "upload","file_index": "1"}];
                        break;
                    case 'labels':
                        v.forEach(d=>{
                            p = me.props.filter(prp=>prp['o:label']==d.p)[0];                        
                            if(!fd[p.term])fd[p.term]=[];
                            fd[p.term].push(formatValue(p,d));                                    
                        })
                        break;                    
                    default:
                        if(!fd[k])fd[k]=[];
                        p = me.props.filter(prp=>prp['o:term']==k)[0];
                        if(Array.isArray(v)){
                            fd[k] = v.map(val=>formatValue(p,val));
                        }else                        
                            fd[k].push(formatValue(p,v));    
                        break;
                }
            }                         
            return fd;
        }
        function formatValue(p,v){
            if(typeof v === 'object' && v.rid)
                return {"property_id": p['o:id'], "value_resource_id" : v.rid, "type" : "resource" };    
            else if(typeof v === 'object' && v.u)
                return {"property_id": p['o:id'], "@id" : v.u, "o:label":v.l, "type" : "uri" };    
            else if(typeof v === 'object')
                return {"property_id": p['o:id'], "@value" : JSON.stringify(v), "type" : "literal" };    
            else
                return {"property_id": p['o:id'], "@value" : v, "type" : "literal" };    
        }
        
        async function postData(url, data = {},file) {
            // Default options are marked with *
            let bodyData, 
            options ={
                method: url.m, // *GET, POST, PUT, DELETE, etc.
                mode: "cors", // no-cors, *cors, same-origin
                cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
                credentials: "same-origin", // include, *same-origin, omit
                referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
            };
            
            if(url.m=='POST' || url.m=='PUT' || url.m=='PATCH'){
                if(file){
                    bodyData = new FormData();
                    bodyData.append('data', JSON.stringify(data));
                    bodyData.append('file[1]', file);                     
                }else{
                    bodyData=JSON.stringify(data);
                    options.headers= {
                        "Content-Type":"application/json"
                        };
                }
                options.body=bodyData;
            }
            const response = await fetch(url.u, options);
            me.loader.hide(true);
            return response.json(); // parses JSON response into native JavaScript objects
        }        

        this.getSiteViewRequest = function(q,cb){
            let url = me.api.replace('api','s')+q;
            me.loader.show();
            d3.json(url).then(json=>{
                me.loader.hide(true);
                cb(json);
            });
            //cb(syncRequest(url));
        }

        function syncRequest(q){
            me.loader.show();
            const request = new XMLHttpRequest();
            request.open('GET', q, false);  
            request.send(null);        
            if (request.status === 200) {
                me.loader.hide();
                return JSON.parse(request.response);
            }        
        };       

        function request(url, cb){
            me.loader.show();
            d3.json(url).then(json=>{
                cb(json);
                me.loader.hide();
            });
        };       

        this.init();
    }
}
