import * as noUiSlider from './nouislider.min.mjs';

export class slider {
    constructor(params={}) {
        var me = this;
        this.init = function () {
            params.cont.append('h6').text(params.titre);
            let slider =params.cont.append('div').attr('id',params.id).node();
                        
            var formatForSlider = params.format=='unique' ? null : {
                from: function (formattedValue) {
                    return formatValue(formattedValue);
                },
                to: function(numericValue) {
                    return formatValue(numericValue);
                }
            };
            noUiSlider.create(slider, {
                start: params.start,
                connect: true,
                range: {
                    'min': params.ext[0],
                    'max': params.ext[1]
                }        ,
                format: formatForSlider,
                tooltips: {
                    // tooltips are output only, so only a "to" is needed
                    to: function(numericValue) {
                        return formatValue(numericValue);
                    }
                }
            });
            params.fct.forEach(fct=>{
                slider.noUiSlider.on(fct.e, function (values, handle, unencoded, tap, positions, noUiSlider) {
                    fct.f(values,params);
                 })
            });              

        }
        function formatValue(v){
            return  params.numberFormat ? params.numberFormat(v) : parseInt(v);
        }
        this.init();
    }
}
