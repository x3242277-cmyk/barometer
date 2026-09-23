const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function element(){return {hidden:false,disabled:false,value:'',textContent:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},focus(){this.focused=true;},select(){this.selected=true;}};}
const form=element(),trigger=element(),label=element(),input=element(),submit=element(),status=element();
label.hidden=true;submit.hidden=true;input.disabled=true;
form.querySelector=selector=>({'#admin-trigger':trigger,'#admin-password':label,'#admin-submit':submit})[selector];label.querySelector=()=>input;
let sent,navigated='';
const ctx=vm.createContext({document:{querySelector:selector=>({'#inline-admin':form,'#admin-inline-status':status})[selector]},location:{assign(url){navigated=url;}},fetch:async(url,options)=>{sent={url,options};return {ok:true,status:200,json:async()=>({ok:true})};}});
vm.runInContext(fs.readFileSync('assets/inline-admin.js','utf8'),ctx);
trigger.listeners.click();assert.equal(trigger.hidden,true);assert.equal(label.hidden,false);assert.equal(input.disabled,false);assert.equal(input.focused,true);
input.value='test-private-password-12345678';
form.listeners.submit({preventDefault(){}}).then(()=>{assert.equal(sent.url,'/api/admin/session');assert.equal(sent.options.credentials,'same-origin');assert.equal(JSON.parse(sent.options.body).token,'test-private-password-12345678');assert.equal(input.value,'');assert.equal(navigated,'analytics.html');console.log('Passed: footer management reveals an inline password field, sends it to same-origin login, and opens the dashboard in the same tab.');}).catch(error=>{console.error(error);process.exitCode=1;});
