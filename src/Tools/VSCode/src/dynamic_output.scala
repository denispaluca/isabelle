/*  Title:      Tools/VSCode/src/dynamic_output.scala
    Author:     Makarius

Dynamic output, depending on caret focus: messages, state etc.
*/

package isabelle.vscode


import isabelle._


object Dynamic_Output
{
  sealed case class State(do_update: Boolean = true, output: List[XML.Tree] = Nil)
  {
    def handle_update(
      resources: VSCode_Resources, channel: Channel, restriction: Option[Set[Command]]): State =
    {
      val st1 =
        resources.get_caret() match {
          case None => copy(output = Nil)
          case Some(caret) =>
            val snapshot = caret.model.snapshot()
            if (do_update && !snapshot.is_outdated) {
              snapshot.current_command(caret.node_name, caret.offset) match {
                case None => copy(output = Nil)
                case Some(command) =>
                  copy(output =
                    if (restriction.isEmpty || restriction.get.contains(command))
                      Rendering.output_messages(snapshot.command_results(command))
                    else output)
              }
            }
            else this
        }
      if (st1.output != output) {
        val elements3: Presentation.Elements =
          Presentation.Elements(
            html = Presentation.elements2.html,
            language = Presentation.elements2.language,
            entity = Markup.Elements.full)

        def entity_link(props: Properties.T, body: XML.Body): Option[XML.Tree] =
          (props, props) match {
            case (Position.Def_File(thy_file), Position.Def_Line(def_line)) =>
              val fileMaybe = resources.source_file(thy_file)
              fileMaybe match {
                  case Some(file) =>
                    //val file = resources.node_file(value)
                    Some(HTML.link(File.absolute(File.platform_file(Path.explode(file))).toURI.toString + "#" + def_line, body))
                  case _ => None
              }
            case _ => None
          }
        val htmlBody = Presentation.make_html(
          elements3,
          entity_link,
          Pretty.separate(st1.output))

        channel.write(LSP.Dynamic_Output(HTML.source(htmlBody).toString()))
      }
      st1
    }
  }

  def apply(server: Language_Server): Dynamic_Output = new Dynamic_Output(server)
}


class Dynamic_Output private(server: Language_Server)
{
  private val state = Synchronized(Dynamic_Output.State())

  private def handle_update(restriction: Option[Set[Command]]): Unit =
    state.change(_.handle_update(server.resources, server.channel, restriction))


  /* main */

  private val main =
    Session.Consumer[Any](getClass.getName) {
      case changed: Session.Commands_Changed =>
        handle_update(if (changed.assignment) None else Some(changed.commands))

      case Session.Caret_Focus =>
        handle_update(None)
    }

  def init(): Unit =
  {
    server.session.commands_changed += main
    server.session.caret_focus += main
    handle_update(None)
  }

  def exit(): Unit =
  {
    server.session.commands_changed -= main
    server.session.caret_focus -= main
  }
}
