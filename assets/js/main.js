    //merci à https://medium.com/@danny.pule/export-json-to-csv-file-using-javascript-a0b7bc5b00d2
    function convertToCSV(objArray) {
        var array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
        var str = '';

        for (var i = 0; i < array.length; i++) {
            var line = '';
            for (var index in array[i]) {
                if (line != '') line += ','

                line += array[i][index];
            }

            str += line + '\r\n';
        }

        return str;
    }        


    function exportCSVFile(headers, items, fileTitle) {
        if (headers) {
            items.unshift(headers);
        }

        // Convert Object to JSON
        var jsonObject = JSON.stringify(items);

        var csv = convertToCSV(jsonObject);

        var exportedFilenmae = fileTitle + '.csv' || 'export.csv';

        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        if (navigator.msSaveBlob) { // IE 10+
            navigator.msSaveBlob(blob, exportedFilenmae);
        } else {
            var link = document.createElement("a");
            if (link.download !== undefined) { // feature detection
                // Browsers that support HTML5 download attribute
                var url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", exportedFilenmae);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }
    }

    function getCellEditor(headers){
        let editors = [];
        headers.forEach(h=>{
            switch (h) {
            case 'choisir':
                editors.push({data:h, type: 'checkbox'})                          
                break;
            default:
                editors.push({data:h, type: 'text'})                  
                break;
            }
          })
        return editors;
    }
    function setMenu(s,data,lbl,fct){
        d3.select(s).selectAll('li').data(data).enter().append('li')
                .append('a').attr('class',"dropdown-item")
                .html(d=>d[lbl])
                .on('click',fct);
    }
