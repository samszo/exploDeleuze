import {loader} from './loader.js';
export class bnf {
    constructor(params={}) {
        var me = this;
        this.modal;
        this.api = params.api ? params.api : false;
        this.endpoint = params.endpoint ? params.endpoint : 'https://data.bnf.fr/sparql?format=application/json&query=';
        this.loader = new loader();
                
        this.init = function () {
            
        } 

        this.findAuthor=async function(nom){
            me.loader.show();
            let query = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
                PREFIX bio: <http://vocab.org/bio/0.1/>
                SELECT ?nom ?nait ?mort ?ref 
                WHERE {
                ?ref bio:birth ?nait.
                ?ref bio:death ?mort.  
                ?ref foaf:name ?nom.
                FILTER regex(?nom, "${nom}", "i")   
                }
                ORDER BY (?nom) LIMIT 100`;
            const response = await getData(me.endpoint,query);
            me.loader.hide(true);
            return response.results.bindings;
        }

        // Function to send POST request to SPARQL endpoint
        async function getData(url, data) {
            const response = await fetch(url+encodeURI(data), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            return response.json();
        }       

        this.init();
    }
}
