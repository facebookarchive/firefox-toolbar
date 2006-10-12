/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * The contents of this file are subject to the Mozilla Public
 * License Version 1.1 (the "License"); you may not use this file
 * except in compliance with the License. You may obtain a copy of
 * the License at http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS
 * IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * rights and limitations under the License.
 *
 * The Original Code is XPI Maker
 *
 * The Initial Developer of the Original Code is Neil Deakin
 * Portions created by Neil Deakin are Copyright (C) 2001 Neil Deakin.
 * All Rights Reserved.
 *
 * Contributor(s):
 */

/* This is a library for easier access to RDF datasources and resources.
 * It contains four objects, RDFDataSource, RDFNode, RDFLiteral. and
 * RDFEnumerator.
 *
 * An RDF DataSource is a graph of nodes and literals. The constructor
 * for RDFDataSource takes one argument, a URI of an RDF file to use.
 * If the URI exists, the contents of the RDF file are loaded. If it
 * does not exist, resources can be added to it and then written using
 * this flush method. If the URL argument is null, a blank datasource
 * is created.
 *
 * This library is designed for convenience not for efficiency.
 *
 * The API is documented at:
 *   http://www.xulplanet.com/tutorials/xultu/rdflib/
 *
 * Example:
 *
 * var ds=new RDFDataSource("file:///main/mozilla/mimtest.rdf");
 * var node=ds.getNode("urn:xpimaker:packlist");
 * var child=ds.getNode("urn:xpimaker:packlist:appinfo");
 * child=node.addChild(child);
 * child.addTarget("http://www.xulplanet.com/rdf/xpimaker#appname","Find Files");
 * ds.flush();
 *
 */

var RDFService = "@mozilla.org/rdf/rdf-service;1";
RDFService = Components.classes[RDFService].getService();
RDFService = RDFService.QueryInterface(Components.interfaces.nsIRDFService);

var RDFContainerUtilsService = "@mozilla.org/rdf/container-utils;1";
RDFContainerUtilsService = Components.classes[RDFContainerUtilsService].getService();
RDFContainerUtilsService = RDFContainerUtilsService.QueryInterface(Components.interfaces.nsIRDFContainerUtils);

/* RDFLoadObserver
 *   this object is necessary to listen to RDF files being loaded. The Init
 *   function should be called to initialize the callback when the RDF file is
 *   loaded.
 */
function RDFLoadObserver(){}
  
RDFLoadObserver.prototype =
{
  callback: null,
  callbackDataSource: null,
  callbackArgs: null,

  /* Init
   *   set a callback to be called when an RDF file has finished loading.
   *     c - function callback which is called with the other two arguments passed
   *         to Init
   *     cDS - datasource being loaded
   *     cArgs - additional arguments passed to the callback function
   */
  Init: function(c,cDS,cArgs){
    this.callback=c;
    this.callbackDataSource=cDS;
    this.callbackArgs=cArgs;
  },

  QueryInterface: function(iid){
    if (iid.equals(Components.interfaces.nsIRDFXMLSinkObserver)) return this;
    else throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  onBeginLoad : function(sink){},
  onInterrupt : function(sink){},
  onResume : function(sink){},
  onError : function(sink,status,msg){},
 
  onEndLoad : function(sink){
    if (this.callback!=null) this.callback(this.callbackDataSource,this.callbackArgs);
  }
};  


function RDFDataSource(uri,doload,callbackFn,cArgs)
{
  if (uri==null) this.datasource=null;
  else {
    this.datasource=RDFService.GetDataSource(uri);

    if (doload){
      try {
        var ds=this.datasource.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource);
        if (ds.loaded){
          callbackFn(this,cArgs);
          return;
        }
      }
      catch (ex){
        return;
      }

      var packObserver=new RDFLoadObserver();
  
      packObserver.Init(callbackFn,this,cArgs);

      var rawsource=this.datasource;
      rawsource=rawsource.QueryInterface(Components.interfaces.nsIRDFXMLSink);
      rawsource.addXMLSinkObserver(packObserver);
    }
  }
}

RDFDataSource.prototype.Init=
  function (dsource)
{
  this.datasource=dsource;
}

RDFDataSource.prototype.makeemptyds=
  function (uri)
{
  this.datasource=Components.classes["@mozilla.org/rdf/datasource;1?name=in-memory-datasource"]
                            .createInstance(Components.interfaces.nsIRDFDataSource);
}

RDFDataSource.prototype.getAllResources=
  function ()
{
  if (this.datasource==null) return null;
  return new RDFEnumerator(this.datasource.GetAllResources(),this.datasource);
}

RDFDataSource.prototype.getRawDataSource=
  function ()
{
  if (this.datasource==null) this.makeemptyds();
  return this.datasource;
}

RDFDataSource.prototype.getNode=
  function (uri)
{
  if (this.datasource==null) this.makeemptyds();
  var node=new RDFNode(uri,this);
  return node;
}

RDFDataSource.prototype.getAnonymousNode=
  function ()
{
  if (this.datasource==null) this.makeemptyds();

  var anon=RDFService.GetAnonymousResource();
  var node=new RDFNode();
  node.Init(anon,this.datasource);
  return node;
}

RDFDataSource.prototype.getLiteral=
  function (uri)
{
  if (this.datasource==null) this.makeemptyds();

  return new RDFLiteral(uri,this);
}

RDFDataSource.prototype.refresh=
  function (sync)
{
  try {
    var ds=this.datasource.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource);
    ds.Refresh(sync);
    return true;
  }
  catch (ex){
    return false;
  }
}

RDFDataSource.prototype.flush=
  function ()
{
  try {
    var ds=this.datasource.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource);
    ds.Flush();
    return true;
  }
  catch (ex){
    return false;
  }
}

RDFDataSource.prototype.copyAllToDataSource=
  function (dsource2)
{
  if (this.datasource==null) this.makeemptyds();
  if (dsource2.datasource==null) dsource2.makeemptyds();

  var dsource1=this.datasource;
  dsource2=dsource2.datasource;

  var sourcelist=dsource1.GetAllResources();
  while(sourcelist.hasMoreElements()){
    var source=sourcelist.getNext();
    var props=dsource1.ArcLabelsOut(source);
    while(props.hasMoreElements()){
      var prop=props.getNext();
      prop=prop.QueryInterface(Components.interfaces.nsIRDFResource);
      var target=dsource1.GetTarget(source,prop,true);
      if (target!=null) dsource2.Assert(source,prop,target,true);
    }
  }
}

RDFDataSource.prototype.deleteRecursive=
  function (val)
{
  var node;
  var dsource=this.datasource;

  if (dsource==null) return;

  if (typeof val == "string") node=RDFService.GetResource(val);
  else node=val.source;

  this.deleteRecursiveH(dsource,node); // remove descendants

  // remove the node itself
  var props=dsource.ArcLabelsIn(node);
  while(props.hasMoreElements()){
    var prop=props.getNext();
    var source=dsource.GetSource(prop,node,true);
    dsource.Unassert(source,prop,node);
  }
}

RDFDataSource.prototype.deleteRecursiveH=
  function (dsource,node)
{
  var props=dsource.ArcLabelsOut(node);
  while(props.hasMoreElements()){
    var prop=props.getNext();
    var target=dsource.GetTarget(node,prop,true);
    try {
      target=target.QueryInterface(Components.interfaces.nsIRDFResource);
      this.deleteRecursiveH(dsource,target);
    }
    catch (e){}
    dsource.Unassert(node,prop,target)
  }
}

function RDFNode(uri,dsource)
{
  if (uri==null) this.source=null;
  else this.source=RDFService.GetResource(uri);

  if (dsource==null) this.datasource=null;
  else this.datasource=dsource.datasource;

  this.container=null;
}

RDFNode.prototype.Init=
  function (source,dsource)
{
  this.source=source;
  this.datasource=dsource;
  this.container=null;
}

RDFNode.prototype.getValue=
  function ()
{
  return this.source.Value;
}

RDFNode.prototype.rlify=
  function (val)
{
  var res=null;

  if (val!=null){
    try {
      val=val.QueryInterface(Components.interfaces.nsIRDFResource);
      res=new RDFNode();
      res.Init(val,this.datasource);
    }
    catch (ex){
      try {
        val=val.QueryInterface(Components.interfaces.nsIRDFLiteral);
        res=new RDFLiteral();
        res.Init(val,this.datasource);
      }
      catch (ex2){
      }
    }
  }
  return res;
}

RDFNode.prototype.makeres=
  function (val)
{
  if (typeof val == "string") return RDFService.GetResource(val);
  else return val.source;
}

RDFNode.prototype.makelit=
  function (val)
{
  if (typeof val == "string") return RDFService.GetLiteral(val);
  else return val.source;
}

RDFNode.prototype.makecontain=
  function ()
{
  if (this.container!=null) return true;

  var RDFContainer = '@mozilla.org/rdf/container;1';
  RDFContainer = Components.classes[RDFContainer].getInstance();
  RDFContainer = RDFContainer.QueryInterface(Components.interfaces.nsIRDFContainer);

  try {
    RDFContainer.Init(this.datasource,this.source);
    this.container=RDFContainer;
    return true;
  }
  catch (ex){
    return false;
  }
}

RDFNode.prototype.dumpChildren=
  function ()
{
  this.dumpChildrenH(this.source,0);
}

RDFNode.prototype.dumpChildrenH=
  function (node,indent)
{
  var indentspc;
  var props=this.datasource.ArcLabelsOut(node);
  while(props.hasMoreElements()){
    var prop=props.getNext();
    var target=this.datasource.GetTarget(node,prop,true);
    try {
      target=target.QueryInterface(Components.interfaces.nsIRDFResource);
      indentspc=indent;
      while(indentspc--) dump(" ");
      dump(target.Value+"\n");
      this.dumpChildrenH(target,indent+1);
    }
    catch (e){}
  }
}

RDFNode.prototype.addTarget=
  function (prop,target)
{
  prop=this.makeres(prop);
  target=this.makelit(target);
  this.datasource.Assert(this.source,prop,target,true);
}

RDFNode.prototype.addTargetOnce=
  function (prop,target)
{
  prop=this.makeres(prop);
  target=this.makelit(target);

  var oldtarget=this.datasource.GetTarget(this.source,prop,true);
  if (oldtarget!=null){
    this.datasource.Change(this.source,prop,oldtarget,target);
  }
  else {
    this.datasource.Assert(this.source,prop,target,true);
  }
}

RDFNode.prototype.modifyTarget=
  function (prop,oldtarget,newtarget)
{
  prop=this.makeres(prop);
  oldtarget=this.makelit(oldtarget);
  newtarget=this.makelit(newtarget);
  this.datasource.Change(this.source,prop,oldtarget,newtarget);
}

RDFNode.prototype.modifySource=
  function (prop,oldsource,newsource)
{
  prop=this.makeres(prop);
  oldsource=this.makeres(oldsource);
  newsource=this.makeres(newsource);
  this.datasource.Move(oldsource,newsource,prop,this.source);
}

RDFNode.prototype.targetExists=
  function (prop,target)
{
  prop=this.makeres(prop);
  target=this.makelit(target);
  return this.datasource.HasAssertion(this.source,prop,target,true);
}

RDFNode.prototype.removeTarget=
  function (prop,target)
{
  prop=this.makeres(prop);
  target=this.makelit(target);
  this.datasource.Unassert(this.source,prop,target);
}

RDFNode.prototype.getProperties=
  function ()
{
  return new RDFEnumerator(this.datasource.ArcLabelsOut(this.source),this.datasource);
}

RDFNode.prototype.getInProperties=
  function ()
{
  return new RDFEnumerator(this.datasource.ArcLabelsIn(this.source),this.datasource);
}

RDFNode.prototype.propertyExists=
  function (prop)
{
  prop=this.makeres(prop);
  return this.datasource.hasArcOut(this.source,prop);
}

RDFNode.prototype.inPropertyExists=
  function (prop)
{
  prop=this.makeres(prop);
  return this.datasource.hasArcIn(this.source,prop);
}

RDFNode.prototype.getTarget=
  function (prop)
{
  prop=this.makeres(prop);
  return this.rlify(this.datasource.GetTarget(this.source,prop,true));
}

RDFNode.prototype.getSource=
  function (prop)
{
  prop=this.makeres(prop);
  var src=this.datasource.GetSource(prop,this.source,true);
  if (src==null) return null;
  var res=new RDFNode();
  res.Init(src,this.datasource);
  return res;
}

RDFNode.prototype.getTargets=
  function (prop)
{
  prop=this.makeres(prop);
  return new RDFEnumerator(
    this.datasource.GetTargets(this.source,prop,true),this.datasource);
}

RDFNode.prototype.getSources=
  function (prop)
{
  prop=this.makeres(prop);
  return new RDFEnumerator(
    this.datasource.GetSources(prop,this.source,true),this.datasource);
}

RDFNode.prototype.makeBag=
  function ()
{
  this.container=RDFContainerUtilsService.MakeBag(this.datasource,this.source);
}

RDFNode.prototype.makeSeq=
  function ()
{
  this.container=RDFContainerUtilsService.MakeSeq(this.datasource,this.source);
}

RDFNode.prototype.makeAlt=
  function ()
{
  this.container=RDFContainerUtilsService.MakeAlt(this.datasource,this.source);
}

RDFNode.prototype.isBag=
  function ()
{
  return RDFContainerUtilsService.isBag(this.datasource,this.source);
}

RDFNode.prototype.isSeq=
  function ()
{
  return RDFContainerUtilsService.isSeq(this.datasource,this.source);
}

RDFNode.prototype.isAlt=
  function ()
{
  return RDFContainerUtilsService.isAlt(dsource,this.source);
}

RDFNode.prototype.isContainer=
  function ()
{
  return RDFContainerUtilsService.IsContainer(this.datasource,this.source);
}

RDFNode.prototype.getChildCount=
  function ()
{
  if (this.makecontain()){
    return this.container.GetCount();
  }
  return -1;
}

RDFNode.prototype.getChildren=
  function ()
{
  if (this.makecontain()){
    return new RDFEnumerator(this.container.GetElements(),this.datasource);
  }
  else return null;
}

RDFNode.prototype.addChild=
  function (child,exists)
{
  if (this.makecontain()){
    var childres=null;
    if (typeof child == "string"){
      childres=RDFService.GetResource(child);
      child=new RDFNode();
      child.Init(childres,this.datasource);
    }
    else childres=child.source;

    if (!exists && this.container.IndexOf(childres)>=0) return child;

    this.container.AppendElement(childres);
    return child;
  }
  else return null;
}

RDFNode.prototype.addChildAt=
  function (child,idx)
{
  if (this.makecontain()){
    var childres=null;
    if (typeof child == "string"){
      childres=RDFService.GetResource(child);
      child=new RDFNode();
      child.Init(childres,this.datasource);
    }
    else childres=child.source;
    this.container.InsertElementAt(childres,idx,true);
    return child;
  }
  else return null;
}

RDFNode.prototype.removeChild=
  function (child)
{
  if (this.makecontain()){
    var childres=null;
    if (typeof child == "string"){
      childres=RDFService.GetResource(child);
      child=new RDFNode();
      child.Init(childres,this.datasource);
    }
    else childres=child.source;
    this.container.RemoveElement(childres,true);
    return child;
  }
  else return null;
}

RDFNode.prototype.removeChildAt=
  function (idx)
{
  if (this.makecontain()){
    var childres=this.container.RemoveElementAt(idx,true);
    return this.rlify(childres);
  }
  else return null;
}

RDFNode.prototype.getChildIndex=
  function (child)
{
  if (this.makecontain()){
    return this.container.IndexOf(child.source);
  }
  else return -1;
}

RDFNode.prototype.type="Node";


function RDFLiteral(val,dsource)
{
  if (val==null) this.source=null;
  else this.source=RDFService.GetLiteral(val);

  if (dsource==null) this.datasource=null;
  else this.datasource=dsource.datasource;
}

RDFLiteral.prototype.Init=
  function (source,dsource)
{
  this.source=source;
  this.datasource=dsource;
}

RDFLiteral.prototype.getValue=
  function ()
{
  return this.source.Value;
}

RDFLiteral.prototype.makeres=
  function (val)
{
  if (typeof val == "string") return RDFService.GetResource(val);
  else return val.source;
}

RDFLiteral.prototype.makelit=
  function (val)
{
  if (typeof val == "string") return RDFService.GetLiteral(val);
  else return val.source;
}

RDFLiteral.prototype.modifySource=
  function (prop,oldsource,newsource)
{
  prop=this.makeres(prop);
  oldsource=this.makeres(oldsource);
  newsource=this.makeres(newsource);
  this.datasource.Move(oldsource,newsource,prop,this.source);
}

RDFLiteral.prototype.getInProperties=
  function (prop)
{
  return new RDFEnumerator(this.datasource.ArcLabelsIn(this.source),this.datasource);
}

RDFLiteral.prototype.inPropertyExists=
  function (prop)
{
  prop=this.makeres(prop);
  return this.datasource.hasArcIn(this.source,prop);
}

RDFLiteral.prototype.getSource=
  function (prop)
{
  prop=this.makeres(prop);
  var src=this.datasource.GetSource(prop,this.source,true);
  if (src==null) return null;
  var res=new RDFNode();
  res.Init(src,this.datasource);
  return res;
}

RDFLiteral.prototype.getSources=
  function (prop)
{
  prop=this.makeres(prop);
  return new RDFEnumerator(
    this.datasource.GetSources(prop,this.source,true),this.datasource);
}

RDFLiteral.prototype.type="Literal";


function RDFEnumerator(enumeration,dsource)
{
  this.datasource=dsource;
  this.enumeration=enumeration;
}

RDFEnumerator.prototype.hasMoreElements=
  function ()
{
  return this.enumeration.hasMoreElements();
}

RDFEnumerator.prototype.getNext=
  function ()
{
  var res=null;
  var val=this.enumeration.getNext();

  if (val!=null){
    try {
      val=val.QueryInterface(Components.interfaces.nsIRDFResource);
      res=new RDFNode();
      res.Init(val,this.datasource);
    }
    catch (ex){
      try {
        val=val.QueryInterface(Components.interfaces.nsIRDFLiteral);
        res=new RDFLiteral();
        res.Init(val,this.datasource);
      }
      catch (ex2){
      }
    }
  }
  return res;
}

dump('loaded rdflib.js\n');
