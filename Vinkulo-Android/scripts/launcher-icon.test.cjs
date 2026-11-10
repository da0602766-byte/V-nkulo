const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
test('launcher uses the transparent V artwork instead of the square cross',()=>{
 const main=path.join(__dirname,'../app/src/main');
 const png=fs.readFileSync(path.join(main,'res/drawable-nodpi/ic_launcher.png'));
 assert.equal(png.subarray(1,4).toString(),'PNG');
 assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);assert.equal(png[25],6);
 const idat=[];for(let p=8;p<png.length;){const n=png.readUInt32BE(p),type=png.toString('ascii',p+4,p+8);if(type==='IDAT')idat.push(png.subarray(p+8,p+8+n));p+=n+12;}
 const input=zlib.inflateSync(Buffer.concat(idat)),width=512,stride=width*4,pixels=Buffer.alloc(512*stride);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<512;y++){const filter=input[y*(stride+1)];for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;const prediction=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];assert.notEqual(prediction,undefined);pixels[i]=(input[y*(stride+1)+1+x]+prediction)&255;}}
 for(const [x,y] of [[0,0],[511,0],[0,511],[511,511]])assert.equal(pixels[(y*512+x)*4+3],0);
 let transparent=0,visible=0;for(let p=3;p<pixels.length;p+=4){if(pixels[p]===0)transparent++;if(pixels[p]>220)visible++;}
 assert.ok(transparent>512*512*.6);assert.ok(visible>512*512*.15);
 assert.equal(fs.existsSync(path.join(main,'res/drawable/ic_launcher.xml')),false);
 const manifest=fs.readFileSync(path.join(main,'AndroidManifest.xml'),'utf8');
 assert.match(manifest,/android:icon="@drawable\/ic_launcher"/);assert.match(manifest,/android:roundIcon="@drawable\/ic_launcher"/);
});
