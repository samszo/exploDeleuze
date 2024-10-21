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

        this.getArkInfo = async function(idArk){
            me.loader.show();
            let query = `https://data.bnf.fr/sparql?query=SELECT%20?s%20?p%20?o%0AWHERE%20%7B%20%0A%20%20%3Chttp://data.bnf.fr/${idArk}%23about%3E%20?p%20?o%20.%20%0A%20%20%0A%7D%0ALIMIT%20100&format=application/json`;
            const response = await getData(query);
            me.loader.hide(true);
            return response.results.bindings;
        }
            
        this.findGallica = async function(idArk){
            me.loader.show();
            /*
            let query = `PREFIX rdarelationships: <http://rdvocab.info/RDARelationshipsWEMI/>
                PREFIX dcterms: <http://purl.org/dc/terms/>
                SELECT DISTINCT ?title ?URLGallica
                WHERE {
                    <http://data.bnf.fr/${idArk}#about> rdarelationships:electronicReproduction ?URLGallica;
                    dcterms:title ?title.
                } LIMIT 1`;
            const response = await getData(me.endpoint,query);
            */
            let query = `https://data.bnf.fr/sparql?query=PREFIX%20rdarelationships:%20%3Chttp://rdvocab.info/RDARelationshipsWEMI/%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20PREFIX%20dcterms:%20%3Chttp://purl.org/dc/terms/%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20SELECT%20DISTINCT%20?title%20?URLGallica%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20WHERE%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Chttp://data.bnf.fr/${idArk}%23about%3E%20rdarelationships:electronicReproduction%20?URLGallica;%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20dcterms:title%20?title.%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%7D%20LIMIT%201&format=application/json`
            const response = await getData(query);
            me.loader.hide(true);
            return response.results.bindings;
        }            

        this.findAuthor=async function(nom){
            me.loader.show();
            let query = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX bio: <http://vocab.org/bio/0.1/>
SELECT ?nom ?nait ?mort ?ref ?prenom ?famille 
WHERE {
?ref bio:birth ?nait.
?ref foaf:name ?nom.
OPTIONAL {
?ref bio:death ?mort.  
?ref foaf:givenName ?prenom.
?ref foaf:familyName ?famille.
}
FILTER regex(?nom, "${nom}", "i")   
}
ORDER BY (?nom) LIMIT 100`;
            const response = await getData(me.endpoint,query);
            me.loader.hide(true);
            return response.results.bindings;
        }

        // Function to send POST request to SPARQL endpoint
        async function getData(url, data) {
            let q = data ? url+encodeURI(data) : url;
            const response = await fetch(q, {
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
